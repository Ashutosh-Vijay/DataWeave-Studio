//! Best-effort DataWeave 1.0 → 2.0 source migration. Rust port of the frontend
//! `src/dwMigrate.ts` so the MCP server can offer it to agents. Heuristic / line
//! based — the result MUST still be run through `validate_and_run_dataweave`.

use regex::Regex;
use std::collections::HashMap;

pub struct MigrationResult {
    pub output: String,
    pub warnings: Vec<String>,
}

pub fn migrate_dw1_to_2(src: &str) -> MigrationResult {
    // Compiled once per call — migration is rare, not a hot path.
    let re_header = Regex::new(r"^(\s*)%dw\s+1\.0\b").unwrap();
    let re_input = Regex::new(r"^(\s*)%input\b").unwrap();
    let re_output = Regex::new(r"^(\s*)%output\b").unwrap();
    let re_var = Regex::new(r"^(\s*)%var\b").unwrap();
    let re_namespace = Regex::new(r"^\s*%namespace\b").unwrap();
    let re_function = Regex::new(r"^(\s*)%function\b").unwrap();
    let re_flowvars = Regex::new(r"\bflowVars\b").unwrap();
    let re_inbound_method_dq = Regex::new(r#"\binboundProperties\["http\.method"\]"#).unwrap();
    let re_inbound_method_sq = Regex::new(r"\binboundProperties\.'http\.method'").unwrap();
    let re_inbound = Regex::new(r"\binboundProperties\b").unwrap();
    let re_outbound = Regex::new(r"\boutboundProperties\b").unwrap();
    let re_session = Regex::new(r"\bsessionVars\b").unwrap();
    let re_meta = Regex::new(r"@\(").unwrap();
    let re_p = Regex::new(r"\bp\s*\(").unwrap();
    let re_app = Regex::new(r"\bapp\b").unwrap();
    let re_lookup = Regex::new(r"\blookup\s*\(").unwrap();
    let coerce: Vec<(Regex, &str)> = vec![
        (Regex::new(r"(?i)\bas\s+:string\b").unwrap(), "as String"),
        (Regex::new(r"(?i)\bas\s+:number\b").unwrap(), "as Number"),
        (Regex::new(r"(?i)\bas\s+:boolean\b").unwrap(), "as Boolean"),
        (Regex::new(r"(?i)\bas\s+:datetime\b").unwrap(), "as DateTime"),
        (Regex::new(r"(?i)\bas\s+:date\b").unwrap(), "as Date"),
        (Regex::new(r"(?i)\bas\s+:localtime\b").unwrap(), "as LocalTime"),
        (Regex::new(r"(?i)\bas\s+:localdatetime\b").unwrap(), "as LocalDateTime"),
        (Regex::new(r"(?i)\bas\s+:time\b").unwrap(), "as Time"),
        (Regex::new(r"(?i)\bas\s+:object\b").unwrap(), "as Object"),
        (Regex::new(r"(?i)\bas\s+:array\b").unwrap(), "as Array"),
    ];

    let mut out: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut tally: HashMap<&str, usize> = HashMap::new();

    for raw in src.split('\n') {
        let mut line = raw.to_string();

        if re_header.is_match(&line) {
            *tally.entry("header").or_insert(0) += 1;
            line = re_header.replace(&line, "${1}%dw 2.0").into_owned();
        }
        if re_input.is_match(&line) {
            *tally.entry("directive").or_insert(0) += 1;
            line = re_input.replace(&line, "${1}input").into_owned();
        }
        if re_output.is_match(&line) {
            *tally.entry("directive").or_insert(0) += 1;
            line = re_output.replace(&line, "${1}output").into_owned();
        }
        if re_var.is_match(&line) {
            *tally.entry("directive").or_insert(0) += 1;
            line = re_var.replace(&line, "${1}var").into_owned();
        }

        // %namespace → commented out + manual-conversion warning. Skips the rest.
        if re_namespace.is_match(&line) {
            out.push("// TODO: convert %namespace to import statement".to_string());
            warnings.push("%namespace: convert manually to `import * from <namespace>`".to_string());
            *tally.entry("warn").or_insert(0) += 1;
            out.push(re_namespace.replace(&line, "// %namespace").into_owned());
            continue;
        }

        if re_function.is_match(&line) {
            *tally.entry("directive").or_insert(0) += 1;
            line = re_function.replace(&line, "${1}fun").into_owned();
        }

        let n = re_flowvars.find_iter(&line).count();
        if n > 0 {
            *tally.entry("mule").or_insert(0) += n;
            line = re_flowvars.replace_all(&line, "vars").into_owned();
        }
        for re in [&re_inbound_method_dq, &re_inbound_method_sq] {
            let n = re.find_iter(&line).count();
            if n > 0 {
                *tally.entry("mule").or_insert(0) += n;
                line = re.replace_all(&line, "attributes.method").into_owned();
            }
        }
        let n = re_inbound.find_iter(&line).count();
        if n > 0 {
            *tally.entry("mule").or_insert(0) += n;
            line = re_inbound.replace_all(&line, "attributes.headers").into_owned();
        }

        if re_outbound.is_match(&line) {
            warnings.push("outboundProperties: no direct DW 2.0 equivalent — remove or pass as named input".to_string());
            *tally.entry("warn").or_insert(0) += 1;
        }
        if re_session.is_match(&line) {
            warnings.push("sessionVars: no direct DW 2.0 equivalent".to_string());
            *tally.entry("warn").or_insert(0) += 1;
        }

        let before = line.clone();
        for (re, rep) in &coerce {
            line = re.replace_all(&line, *rep).into_owned();
        }
        if line != before {
            *tally.entry("coerce").or_insert(0) += 1;
        }

        if re_meta.is_match(&line) {
            warnings.push("@(...) metadata annotations: syntax may differ in DW 2.0".to_string());
            *tally.entry("warn").or_insert(0) += 1;
        }
        if re_p.is_match(&line) && !re_app.is_match(&line) {
            warnings.push("p(\"key\"): not available in DW CLI. Use ${key} / ${secure::key} placeholders with the Config YAML panel instead.".to_string());
            *tally.entry("warn").or_insert(0) += 1;
        }
        if re_lookup.is_match(&line) {
            warnings.push("lookup(): not available in DW 2.0 standalone CLI".to_string());
            *tally.entry("warn").or_insert(0) += 1;
        }

        out.push(line);
    }

    let mut result = out.join("\n");
    if !warnings.is_empty() {
        let header = warnings
            .iter()
            .map(|w| format!("// ⚠ {}", w))
            .collect::<Vec<_>>()
            .join("\n");
        result = format!("{}\n{}", header, result);
    }

    MigrationResult { output: result, warnings }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_header_and_directives() {
        let o = migrate_dw1_to_2("%dw 1.0\n%output application/json\n%var x = 1\n---\nx").output;
        assert!(o.contains("%dw 2.0"));
        assert!(o.contains("output application/json"));
        assert!(o.contains("var x = 1"));
        assert!(!o.contains("%output"));
        assert!(!o.contains("%var"));
    }

    #[test]
    fn function_and_input() {
        let o = migrate_dw1_to_2("%function double(x) = x * 2\n%input payload application/json").output;
        assert!(o.contains("fun double(x) = x * 2"));
        assert!(o.contains("input payload application/json"));
    }

    #[test]
    fn mule3_bindings() {
        let o = migrate_dw1_to_2("flowVars.foo ++ inboundProperties[\"http.method\"] ++ inboundProperties.bar").output;
        assert!(o.contains("vars.foo"));
        assert!(o.contains("attributes.method"));
        assert!(o.contains("attributes.headers.bar"));
        assert!(!o.contains("flowVars"));
        assert!(!o.contains("inboundProperties"));
    }

    #[test]
    fn legacy_coercion() {
        let o = migrate_dw1_to_2("payload.a as :string ++ payload.b as :number ++ payload.c as :datetime").output;
        assert!(o.contains("as String"));
        assert!(o.contains("as Number"));
        assert!(o.contains("as DateTime"));
        assert!(!Regex::new(r"as\s+:").unwrap().is_match(&o));
    }

    #[test]
    fn no_equivalent_warnings() {
        let w = migrate_dw1_to_2("outboundProperties.x\nsessionVars.y\nlookup(\"flow\", payload)").warnings;
        assert!(w.iter().any(|x| x.contains("outboundProperties")));
        assert!(w.iter().any(|x| x.contains("sessionVars")));
        assert!(w.iter().any(|x| x.contains("lookup")));
    }

    #[test]
    fn namespace_commented_and_warned() {
        let r = migrate_dw1_to_2("%namespace ns http://example.com");
        assert!(r.output.contains("// %namespace"));
        assert!(r.warnings.iter().any(|w| w.contains("%namespace")));
    }

    #[test]
    fn p_warns_unless_app_in_scope() {
        assert!(migrate_dw1_to_2("p(\"db.host\")").warnings.iter().any(|w| w.starts_with("p(")));
        assert!(!migrate_dw1_to_2("app.config.host").warnings.iter().any(|w| w.starts_with("p(")));
    }

    #[test]
    fn clean_dw2_is_unchanged() {
        let src = "%dw 2.0\noutput application/json\n---\n{ id: payload.id }";
        let r = migrate_dw1_to_2(src);
        assert_eq!(r.output, src);
        assert!(r.warnings.is_empty());
    }
}
