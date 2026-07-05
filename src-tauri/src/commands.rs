use std::path::Path;

#[derive(Debug, serde::Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<Entry>, String> {
    let dir = std::fs::read_dir(&path).map_err(|e| format!("Cannot read \"{path}\": {e}"))?;
    let mut entries: Vec<Entry> = dir
        .filter_map(|res| res.ok())
        .filter_map(|de| {
            let name = de.file_name().to_string_lossy().into_owned();
            // Hidden by cross-platform dotfile convention; Windows attribute-hidden
            // files are intentionally not handled (no OS-specific code).
            if name.starts_with('.') {
                return None;
            }
            let p = de.path();
            // file_type() is free (readdir metadata); stat only for symlinks so
            // a symlink to a directory still lists as a folder.
            let is_dir = match de.file_type() {
                Ok(ft) if ft.is_symlink() => p.is_dir(),
                Ok(ft) => ft.is_dir(),
                Err(_) => p.is_dir(),
            };
            Some(Entry {
                is_dir,
                path: p.to_string_lossy().into_owned(),
                name,
            })
        })
        .collect();
    entries.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));
    Ok(entries)
}

/// Moves `source` into `target_dir`, keeping its file name. Returns the new path.
/// Uses fs::rename only: cross-volume moves fail with the OS error;
/// copy+delete fallback is future work.
#[tauri::command]
pub fn move_entry(source: String, target_dir: String) -> Result<String, String> {
    let src = Path::new(&source);
    let name = src
        .file_name()
        .ok_or_else(|| format!("Invalid source path: {source}"))?;
    let dest = Path::new(&target_dir).join(name);
    // Self-nesting is only possible when moving a directory, so pay for the
    // canonicalize-based containment check (symlink-safe) only in that case.
    if src.is_dir() {
        let src_real = src
            .canonicalize()
            .map_err(|e| format!("Cannot access \"{source}\": {e}"))?;
        let target_real = Path::new(&target_dir)
            .canonicalize()
            .map_err(|e| format!("Cannot access \"{target_dir}\": {e}"))?;
        if target_real.starts_with(&src_real) {
            return Err("Cannot move a folder into itself".into());
        }
    }
    if dest.exists() {
        return Err(format!(
            "\"{}\" already exists in the destination",
            name.to_string_lossy()
        ));
    }
    std::fs::rename(src, &dest).map_err(|e| format!("Failed to move: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("Failed to move to trash: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(path: &Path) {
        fs::write(path, b"").unwrap();
    }

    #[test]
    fn read_directory_sorts_dirs_first_then_case_insensitive_names() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("zeta")).unwrap();
        fs::create_dir(tmp.path().join("Alpha")).unwrap();
        touch(&tmp.path().join("beta.txt"));
        touch(&tmp.path().join("Apple.txt"));

        let entries = read_directory(tmp.path().to_string_lossy().into_owned()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["Alpha", "zeta", "Apple.txt", "beta.txt"]);
    }

    #[test]
    fn read_directory_skips_dotfiles() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join(".hidden"));
        touch(&tmp.path().join("visible.txt"));

        let entries = read_directory(tmp.path().to_string_lossy().into_owned()).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["visible.txt"]);
    }

    #[test]
    fn read_directory_nonexistent_path_errors_with_path() {
        let err = read_directory("/nonexistent-voyager-test".into()).unwrap_err();
        assert!(err.contains("/nonexistent-voyager-test"));
    }

    #[test]
    fn move_entry_moves_file_into_target_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("a.txt");
        touch(&src);
        let target = tmp.path().join("sub");
        fs::create_dir(&target).unwrap();

        let new_path = move_entry(
            src.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .unwrap();

        assert!(!src.exists());
        assert!(Path::new(&new_path).exists());
        assert_eq!(Path::new(&new_path), target.join("a.txt"));
    }

    #[test]
    fn move_entry_collision_errors_and_keeps_source() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("b.txt");
        touch(&src);
        let target = tmp.path().join("sub");
        fs::create_dir(&target).unwrap();
        touch(&target.join("b.txt"));

        let err = move_entry(
            src.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .unwrap_err();

        assert!(err.contains("already exists"));
        assert!(src.exists());
    }

    #[test]
    fn move_entry_folder_into_itself_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let sub = tmp.path().join("sub");
        fs::create_dir(&sub).unwrap();

        let err = move_entry(
            sub.to_string_lossy().into_owned(),
            sub.to_string_lossy().into_owned(),
        )
        .unwrap_err();

        assert_eq!(err, "Cannot move a folder into itself");
        assert!(sub.exists());
    }
}
