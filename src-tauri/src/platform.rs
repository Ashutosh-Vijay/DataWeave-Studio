use std::process::Command;

#[cfg(target_os = "windows")]
pub fn hide_console_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
pub fn hide_console_window(_cmd: &mut Command) {}

#[cfg(target_os = "windows")]
pub fn strip_unc_prefix(path: std::path::PathBuf) -> std::path::PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix("\\\\?\\") {
        std::path::PathBuf::from(stripped)
    } else {
        path
    }
}

#[cfg(not(target_os = "windows"))]
pub fn strip_unc_prefix(path: std::path::PathBuf) -> std::path::PathBuf {
    path
}

// The rating prompt's state, in the user's home folder rather than WebView
// storage, so an update never makes it ask again. Shared with the VS Code
// extension (vscode-extension/src/extension.ts), so rating in one counts for both.
fn feedback_prompt_path() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(std::path::PathBuf::from(home).join(".dataweave-studio").join("feedback-prompt.json"))
}

#[tauri::command]
pub fn read_feedback_prompt() -> Option<String> {
    std::fs::read_to_string(feedback_prompt_path()?).ok()
}

#[tauri::command]
pub fn write_feedback_prompt(state: String) -> Result<(), String> {
    let path = feedback_prompt_path().ok_or("No home folder")?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(path, state).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_strip_unc_prefix() {
        let unc_path = PathBuf::from("\\\\?\\C:\\some\\path");
        let stripped = strip_unc_prefix(unc_path.clone());
        // Under windows, the prefix is stripped. Under non-windows, both functions exist and we can test it directly
        #[cfg(target_os = "windows")]
        assert_eq!(stripped, PathBuf::from("C:\\some\\path"));
        #[cfg(not(target_os = "windows"))]
        assert_eq!(stripped, unc_path);

        let normal_path = PathBuf::from("C:\\some\\path");
        let unstripped = strip_unc_prefix(normal_path.clone());
        assert_eq!(unstripped, normal_path);
    }
}
