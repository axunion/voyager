use std::path::Path;

#[derive(Debug, serde::Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: Option<u64>,
    pub mtime: Option<i64>,
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
            let file_type = de.file_type();
            let is_symlink = matches!(&file_type, Ok(ft) if ft.is_symlink());
            let is_dir = if is_symlink {
                p.is_dir()
            } else {
                file_type
                    .map(|ft| ft.is_dir())
                    .unwrap_or_else(|_| p.is_dir())
            };
            // lstat (does not follow symlinks): a symlink to a file reports
            // the link's own size, which is an intentional trade-off.
            let metadata = de.metadata().ok();
            let size = if is_dir {
                None
            } else {
                metadata.as_ref().map(|m| m.len())
            };
            let mtime = metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or_else(|e| -(e.duration().as_secs() as i64))
            });
            Some(Entry {
                is_dir,
                is_symlink,
                path: p.to_string_lossy().into_owned(),
                name,
                size,
                mtime,
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

/// Renames the entry at `path` to `new_name` within the same parent directory.
/// Returns the new path. Renaming to the same name is a no-op returning Ok(path).
#[tauri::command]
pub fn rename_entry(path: String, new_name: String) -> Result<String, String> {
    validate_name(&new_name)?;
    let src = Path::new(&path);
    let parent = src
        .parent()
        .ok_or_else(|| format!("Invalid path: {path}"))?;
    if src.file_name().and_then(|n| n.to_str()) == Some(new_name.as_str()) {
        return Ok(path);
    }
    let dest = parent.join(&new_name);
    if dest.exists() {
        return Err(format!("\"{new_name}\" already exists"));
    }
    std::fs::rename(src, &dest).map_err(|e| format!("Failed to rename: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Creates a new directory (is_dir=true) or empty file (is_dir=false) named
/// `name` inside `parent`. Returns the new path.
#[tauri::command]
pub fn create_entry(parent: String, name: String, is_dir: bool) -> Result<String, String> {
    validate_name(&name)?;
    let dest = Path::new(&parent).join(&name);
    let map_create_err = |e: std::io::Error| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            format!("\"{name}\" already exists")
        } else {
            format!("Failed to create: {e}")
        }
    };
    if is_dir {
        std::fs::create_dir(&dest).map_err(map_create_err)?;
    } else {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&dest)
            .map_err(map_create_err)?;
    }
    Ok(dest.to_string_lossy().into_owned())
}

/// Shared validation for user-supplied entry names.
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Name cannot be empty".into());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("Name cannot contain path separators".into());
    }
    // read_directory skips dotfiles, so a created dotfile would silently
    // disappear from the UI — reject instead of confusing the user.
    if name.starts_with('.') {
        return Err(if name == "." || name == ".." {
            "Invalid name".into()
        } else {
            format!("\"{name}\" would be hidden")
        });
    }
    Ok(())
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
    fn read_directory_reports_file_size_and_mtime() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("data.txt"), b"hello world").unwrap();

        let entries = read_directory(tmp.path().to_string_lossy().into_owned()).unwrap();
        let entry = entries.iter().find(|e| e.name == "data.txt").unwrap();
        assert_eq!(entry.size, Some(11));
        assert!(entry.mtime.is_some());
    }

    #[test]
    fn read_directory_directory_size_is_none() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("sub")).unwrap();

        let entries = read_directory(tmp.path().to_string_lossy().into_owned()).unwrap();
        let entry = entries.iter().find(|e| e.name == "sub").unwrap();
        assert_eq!(entry.size, None);
        assert!(entry.mtime.is_some());
    }

    #[cfg(unix)]
    #[test]
    fn read_directory_marks_symlinks() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("real.txt"));
        std::os::unix::fs::symlink(tmp.path().join("real.txt"), tmp.path().join("link.txt"))
            .unwrap();

        let entries = read_directory(tmp.path().to_string_lossy().into_owned()).unwrap();
        let real = entries.iter().find(|e| e.name == "real.txt").unwrap();
        let link = entries.iter().find(|e| e.name == "link.txt").unwrap();
        assert!(!real.is_symlink);
        assert!(link.is_symlink);
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

    #[test]
    fn create_entry_creates_file() {
        let tmp = tempfile::tempdir().unwrap();
        let path = create_entry(
            tmp.path().to_string_lossy().into_owned(),
            "new.txt".into(),
            false,
        )
        .unwrap();
        assert!(Path::new(&path).is_file());
    }

    #[test]
    fn create_entry_creates_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let path = create_entry(
            tmp.path().to_string_lossy().into_owned(),
            "newdir".into(),
            true,
        )
        .unwrap();
        assert!(Path::new(&path).is_dir());
    }

    #[test]
    fn create_entry_collision_errors() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join("dup.txt"));

        let err = create_entry(
            tmp.path().to_string_lossy().into_owned(),
            "dup.txt".into(),
            false,
        )
        .unwrap_err();

        assert!(err.contains("already exists"));
    }

    #[test]
    fn create_entry_empty_name_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let err =
            create_entry(tmp.path().to_string_lossy().into_owned(), "".into(), false).unwrap_err();
        assert!(err.contains("cannot be empty"));
    }

    #[test]
    fn create_entry_path_separator_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let err = create_entry(
            tmp.path().to_string_lossy().into_owned(),
            "a/b".into(),
            false,
        )
        .unwrap_err();
        assert!(err.contains("path separators"));
    }

    #[test]
    fn create_entry_dotdot_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let err = create_entry(
            tmp.path().to_string_lossy().into_owned(),
            "..".into(),
            false,
        )
        .unwrap_err();
        assert_eq!(err, "Invalid name");
    }

    #[test]
    fn create_entry_leading_dot_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let err = create_entry(
            tmp.path().to_string_lossy().into_owned(),
            ".hidden".into(),
            false,
        )
        .unwrap_err();
        assert!(err.contains("would be hidden"));
    }

    #[test]
    fn rename_entry_renames_successfully() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("old.txt");
        touch(&src);

        let new_path = rename_entry(src.to_string_lossy().into_owned(), "new.txt".into()).unwrap();

        assert!(!src.exists());
        assert!(Path::new(&new_path).exists());
        assert_eq!(Path::new(&new_path), tmp.path().join("new.txt"));
    }

    #[test]
    fn rename_entry_collision_errors_and_keeps_source() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("a.txt");
        touch(&src);
        touch(&tmp.path().join("b.txt"));

        let err = rename_entry(src.to_string_lossy().into_owned(), "b.txt".into()).unwrap_err();

        assert!(err.contains("already exists"));
        assert!(src.exists());
    }

    #[test]
    fn rename_entry_same_name_is_noop() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("same.txt");
        touch(&src);

        let path = rename_entry(src.to_string_lossy().into_owned(), "same.txt".into()).unwrap();

        assert_eq!(Path::new(&path), src);
        assert!(src.exists());
    }

    #[test]
    fn rename_entry_invalid_name_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("c.txt");
        touch(&src);

        let err = rename_entry(src.to_string_lossy().into_owned(), "".into()).unwrap_err();

        assert!(err.contains("cannot be empty"));
        assert!(src.exists());
    }
}
