//! Managed JAR store for Java interop.
//!
//! JARs the user adds (file picker) or pulls from Maven Central live in
//! `<app-local-data>/jars/`. Their absolute paths are passed on the DataWeave
//! run classpath so `import java!...` / `dw::core::Java` can resolve classes
//! from them. The directory itself is the source of truth — no separate index.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarInfo {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
}

fn jars_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let dir = app_data.join("jars");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create jars dir: {}", e))?;
    Ok(dir)
}

fn jar_info(path: PathBuf) -> JarInfo {
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    JarInfo {
        path: path.to_string_lossy().to_string(),
        filename,
        size_bytes,
    }
}

#[tauri::command]
pub fn list_managed_jars(app: AppHandle) -> Result<Vec<JarInfo>, String> {
    let dir = jars_directory(&app)?;
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension()
                .map(|x| x.eq_ignore_ascii_case("jar"))
                .unwrap_or(false)
            {
                out.push(jar_info(p));
            }
        }
    }
    out.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn get_jars_dir(app: AppHandle) -> Result<String, String> {
    Ok(jars_directory(&app)?.to_string_lossy().to_string())
}

/// Copy a user-picked .jar into the managed store. Idempotent — re-importing
/// the same filename overwrites it.
#[tauri::command]
pub fn import_jar_file(app: AppHandle, src_path: String) -> Result<JarInfo, String> {
    let src = PathBuf::from(&src_path);
    if src
        .extension()
        .map(|x| !x.eq_ignore_ascii_case("jar"))
        .unwrap_or(true)
    {
        return Err("Not a .jar file.".into());
    }
    let filename = src
        .file_name()
        .ok_or("Bad source path")?
        .to_string_lossy()
        .to_string();
    let dir = jars_directory(&app)?;
    let dest = dir.join(&filename);
    fs::copy(&src, &dest).map_err(|e| format!("Failed to copy JAR: {}", e))?;
    Ok(jar_info(dest))
}

#[tauri::command]
pub fn remove_managed_jar(app: AppHandle, path: String) -> Result<(), String> {
    // Only ever delete inside the managed jars dir.
    let dir = jars_directory(&app)?;
    let canon_dir = dir.canonicalize().map_err(|e| e.to_string())?;
    let canon_target = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !canon_target.starts_with(&canon_dir) {
        return Err("Refusing to delete a file outside the managed jars folder.".into());
    }
    fs::remove_file(&canon_target).map_err(|e| {
        // Windows keeps a handle open on any jar the engine has hot-loaded, so
        // a delete fails until the JVM lets go. Point the user at the fix.
        if e.raw_os_error() == Some(32) {
            "Can't remove — the engine has this JAR loaded. Restart the engine (Settings → Runtime), then remove it.".to_string()
        } else {
            format!("Failed to remove JAR: {}", e)
        }
    })?;
    Ok(())
}

/// Download a single artifact's jar from Maven Central (no transitive deps).
/// `group:artifact:version` → `repo1.maven.org/maven2/<group/path>/<a>/<v>/<a>-<v>.jar`.
#[tauri::command]
pub fn download_maven_jar(
    app: AppHandle,
    group: String,
    artifact: String,
    version: String,
) -> Result<JarInfo, String> {
    let group = group.trim();
    let artifact = artifact.trim();
    let version = version.trim();
    if group.is_empty() || artifact.is_empty() || version.is_empty() {
        return Err("group, artifact and version are all required.".into());
    }
    let url = format!(
        "https://repo1.maven.org/maven2/{}/{}/{}/{}-{}.jar",
        group.replace('.', "/"),
        artifact,
        version,
        artifact,
        version
    );
    let resp = ureq::get(&url).call().map_err(|e| match e {
        ureq::Error::Status(404, _) => {
            format!("Not found on Maven Central: {}:{}:{}", group, artifact, version)
        }
        ureq::Error::Status(code, _) => format!("Maven Central returned HTTP {}", code),
        other => format!("Download failed: {}", other),
    })?;
    let mut bytes = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Read failed: {}", e))?;
    // A jar is a zip archive — it must start with the PK magic.
    if bytes.len() < 4 || &bytes[0..2] != b"PK" {
        return Err("Downloaded file is not a valid JAR (zip) archive.".into());
    }
    let filename = format!("{}-{}.jar", artifact, version);
    let dest = jars_directory(&app)?.join(&filename);
    fs::write(&dest, &bytes).map_err(|e| format!("Failed to write JAR: {}", e))?;
    Ok(jar_info(dest))
}

// ===========================================================================
// Java source compilation — compile the user's own .java against the managed
// jars, so their `src/main/java` classes can be tested from DataWeave.
// ===========================================================================

#[derive(Deserialize)]
pub struct JavaSource {
    /// Public class name (the file is written as `<name>.java`).
    pub name: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileResult {
    pub ok: bool,
    /// Output dir for the .class files — put on the run classpath.
    pub classes_dir: String,
    /// javac stdout+stderr (errors/warnings with line numbers).
    pub diagnostics: String,
}

/// Resolve the bundled `javac` (sibling of the bundled `java`), falling back to
/// a system `javac` in dev / if the runtime wasn't jlinked with jdk.compiler.
fn resolve_javac(app: &AppHandle) -> PathBuf {
    let bin = if cfg!(target_os = "windows") {
        "resources/jre/bin/javac.exe"
    } else {
        "resources/jre/bin/javac"
    };
    if let Ok(p) = app
        .path()
        .resolve(bin, tauri::path::BaseDirectory::Resource)
    {
        // Strip the Windows \\?\ verbatim prefix some toolchains choke on.
        let s = p.to_string_lossy();
        let stripped = s.strip_prefix(r"\\?\").map(PathBuf::from).unwrap_or(p);
        if stripped.exists() {
            return stripped;
        }
    }
    PathBuf::from("javac")
}

#[cfg(target_os = "windows")]
fn no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
}
#[cfg(not(target_os = "windows"))]
fn no_window(_cmd: &mut Command) {}

/// Compile the given Java sources (with the managed jars on the classpath) into
/// a fresh per-call output dir. A fresh dir avoids Windows file locks from the
/// running engine; note that a *changed* class still needs an engine restart to
/// take effect, since the engine's classloader caches what it already loaded.
#[tauri::command]
pub fn compile_java(
    app: AppHandle,
    sources: Vec<JavaSource>,
    classpath: Vec<String>,
) -> Result<CompileResult, String> {
    if sources.is_empty() {
        return Err("No Java sources to compile.".into());
    }
    let app_data = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let work = app_data.join("java").join(id.to_string());
    let src_dir = work.join("src");
    let classes_dir = work.join("classes");
    fs::create_dir_all(&src_dir).map_err(|e| format!("Failed to create work dir: {}", e))?;
    fs::create_dir_all(&classes_dir).map_err(|e| format!("Failed to create classes dir: {}", e))?;

    let mut files = Vec::new();
    for s in &sources {
        let fname = if s.name.to_lowercase().ends_with(".java") {
            s.name.clone()
        } else {
            format!("{}.java", s.name)
        };
        let fp = src_dir.join(&fname);
        fs::write(&fp, &s.content).map_err(|e| format!("Failed to write {}: {}", fname, e))?;
        files.push(fp);
    }

    let javac = resolve_javac(&app);
    let mut cmd = Command::new(&javac);
    cmd.arg("-d").arg(&classes_dir);
    if !classpath.is_empty() {
        let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
        cmd.arg("-cp").arg(classpath.join(sep));
    }
    for f in &files {
        cmd.arg(f);
    }
    no_window(&mut cmd);

    let out = cmd
        .output()
        .map_err(|e| format!("Couldn't run javac ({}): {}", javac.display(), e))?;
    // javac writes diagnostics to stderr; include stdout too just in case.
    let mut diagnostics = String::from_utf8_lossy(&out.stderr).to_string();
    diagnostics.push_str(&String::from_utf8_lossy(&out.stdout));
    Ok(CompileResult {
        ok: out.status.success(),
        classes_dir: classes_dir.to_string_lossy().to_string(),
        diagnostics: diagnostics.trim().to_string(),
    })
}
