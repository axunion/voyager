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
pub fn read_directory(path: String, include_hidden: bool) -> Result<Vec<Entry>, String> {
    let dir = std::fs::read_dir(&path).map_err(|e| format!("Cannot read \"{path}\": {e}"))?;
    let mut entries: Vec<Entry> = dir
        .filter_map(|res| res.ok())
        .filter_map(|de| entry_from_dir_entry(de, include_hidden))
        .collect();
    entries.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));
    Ok(entries)
}

/// Builds an `Entry` from a raw `DirEntry`, or `None` if it's a dotfile and
/// `include_hidden` is false.
fn entry_from_dir_entry(de: std::fs::DirEntry, include_hidden: bool) -> Option<Entry> {
    let name = de.file_name().to_string_lossy().into_owned();
    // Hidden by cross-platform dotfile convention; Windows attribute-hidden
    // files are intentionally not handled (no OS-specific code).
    if !include_hidden && name.starts_with('.') {
        return None;
    }
    let p = de.path();
    // Single lstat (does not follow symlinks) drives is_symlink, is_dir, size,
    // and mtime; a symlink to a file/dir reports the link's own size and
    // additionally needs p.is_dir() to see through to the target's type.
    let metadata = de.metadata().ok();
    let is_symlink = metadata
        .as_ref()
        .is_some_and(|m| m.file_type().is_symlink());
    let is_dir = if is_symlink {
        p.is_dir()
    } else {
        metadata
            .as_ref()
            .map(|m| m.is_dir())
            .unwrap_or_else(|| p.is_dir())
    };
    let size = if is_dir {
        None
    } else {
        metadata.as_ref().map(|m| m.len())
    };
    let mtime = metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| {
        match t.duration_since(std::time::UNIX_EPOCH) {
            Ok(d) => d.as_secs() as i64,
            Err(e) => -(e.duration().as_secs() as i64),
        }
    });
    Some(Entry {
        is_dir,
        is_symlink,
        path: p.to_string_lossy().into_owned(),
        name,
        size,
        mtime,
    })
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
        check_not_self_nested(src, &source, &target_dir, "move")?;
    }
    check_no_collision(&dest, name)?;
    std::fs::rename(src, &dest).map_err(io_err("move"))?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Copies `source` into `target_dir`, keeping its file name. Directories are
/// copied recursively. Returns the new path.
#[tauri::command]
pub fn copy_entry(source: String, target_dir: String) -> Result<String, String> {
    let src = Path::new(&source);
    let metadata =
        std::fs::metadata(src).map_err(|e| format!("Cannot access \"{source}\": {e}"))?;
    let name = src
        .file_name()
        .ok_or_else(|| format!("Invalid source path: {source}"))?;
    let is_dir = metadata.is_dir();
    // Self-nesting is only possible when copying a directory, so pay for the
    // canonicalize-based containment check (symlink-safe) only in that case.
    if is_dir {
        check_not_self_nested(src, &source, &target_dir, "copy")?;
    }
    let dest = Path::new(&target_dir).join(name);
    check_no_collision(&dest, name)?;
    if is_dir {
        copy_dir_recursive(src, &dest).map_err(io_err("copy"))?;
    } else {
        std::fs::copy(src, &dest).map_err(io_err("copy"))?;
    }
    Ok(dest.to_string_lossy().into_owned())
}

/// Returns an error if `target_dir` is `src` itself or nested inside it.
/// Symlink-safe: resolves both paths via `canonicalize` before comparing.
fn check_not_self_nested(
    src: &Path,
    source: &str,
    target_dir: &str,
    verb: &str,
) -> Result<(), String> {
    let src_real = src
        .canonicalize()
        .map_err(|e| format!("Cannot access \"{source}\": {e}"))?;
    let target_real = Path::new(target_dir)
        .canonicalize()
        .map_err(|e| format!("Cannot access \"{target_dir}\": {e}"))?;
    if target_real.starts_with(&src_real) {
        return Err(format!("Cannot {verb} a folder into itself"));
    }
    Ok(())
}

/// Returns an error if `dest` already exists.
fn check_no_collision(dest: &Path, name: &std::ffi::OsStr) -> Result<(), String> {
    if dest.exists() {
        return Err(format!(
            "\"{}\" already exists in the destination",
            name.to_string_lossy()
        ));
    }
    Ok(())
}

/// Builds an io-error mapper for `.map_err(io_err("verb"))`, formatting as
/// `Failed to {verb}: {e}` per the error conventions in spec/README.md.
fn io_err<E: std::fmt::Display>(verb: &str) -> impl Fn(E) -> String + '_ {
    move |e| format!("Failed to {verb}: {e}")
}

/// Recursively copies the contents of `src` into a newly-created `dest` directory.
/// Symlinks are followed by `fs::copy`/`fs::create_dir`, so a copied symlink
/// becomes a real file or directory holding the target's contents.
fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dest_child = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), &dest_child)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(io_err("move to trash"))
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
    std::fs::rename(src, &dest).map_err(io_err("rename"))?;
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
            io_err("create")(e)
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
    if name == "." || name == ".." {
        return Err("Invalid name".into());
    }
    Ok(())
}

/// Resolves the sidecar settings file path for a given executable path:
/// normally the exe's own directory. A macOS bundle exe
/// (<Name>.app/Contents/MacOS/<exe>) resolves next to the .app instead,
/// because the signed bundle is sealed. Detection is by path shape rather
/// than #[cfg(target_os)] so the logic is unit-testable on every platform.
/// Returns None only when the exe path has no parent.
fn settings_file_path(exe: &Path) -> Option<std::path::PathBuf> {
    let dir = exe.parent()?;
    let target = bundle_parent_dir(dir).unwrap_or(dir);
    Some(target.join("voyager.json"))
}

/// Returns the directory containing the .app bundle when `dir` is the
/// MacOS directory of one (<Name>.app/Contents/MacOS), None otherwise.
fn bundle_parent_dir(dir: &Path) -> Option<&Path> {
    use std::ffi::OsStr;
    if dir.file_name() != Some(OsStr::new("MacOS")) {
        return None;
    }
    let contents = dir.parent()?;
    if contents.file_name() != Some(OsStr::new("Contents")) {
        return None;
    }
    let app = contents.parent()?;
    if app.extension() != Some(OsStr::new("app")) {
        return None;
    }
    app.parent()
}

/// Resolves the sidecar path for the running executable; the shared impure
/// half of the settings commands below.
fn resolve_settings_path() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(io_err("locate the executable"))?;
    settings_file_path(&exe)
        .ok_or_else(|| "Failed to resolve the settings file location".to_string())
}

/// Removes the sidecar settings file; an already-missing file is Ok.
fn remove_settings(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(io_err("delete settings")(e)),
    }
}

/// Loads the raw sidecar settings file content. Ok(None) means "run
/// session-only": file missing, unreadable, or exe path unresolvable.
/// Never errs today; the Result stays per the command conventions.
#[tauri::command]
pub fn load_settings() -> Result<Option<String>, String> {
    let path = resolve_settings_path().ok();
    Ok(path.and_then(|p| std::fs::read_to_string(p).ok()))
}

/// Writes `content` verbatim to the sidecar settings file. The frontend
/// owns the schema; this command is a byte sink.
#[tauri::command]
pub fn save_settings(content: String) -> Result<(), String> {
    let path = resolve_settings_path()?;
    std::fs::write(&path, content).map_err(io_err("save settings"))
}

/// Deletes the sidecar settings file (persistence turned off).
#[tauri::command]
pub fn delete_settings() -> Result<(), String> {
    remove_settings(&resolve_settings_path()?)
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

        let entries = read_directory(tmp.path().to_string_lossy().into_owned(), false).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["Alpha", "zeta", "Apple.txt", "beta.txt"]);
    }

    #[test]
    fn read_directory_skips_dotfiles() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join(".hidden"));
        touch(&tmp.path().join("visible.txt"));

        let entries = read_directory(tmp.path().to_string_lossy().into_owned(), false).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["visible.txt"]);
    }

    #[test]
    fn read_directory_includes_dotfiles_when_asked() {
        let tmp = tempfile::tempdir().unwrap();
        touch(&tmp.path().join(".hidden"));
        touch(&tmp.path().join("visible.txt"));

        let entries = read_directory(tmp.path().to_string_lossy().into_owned(), true).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, [".hidden", "visible.txt"]);
    }

    #[test]
    fn read_directory_nonexistent_path_errors_with_path() {
        let err = read_directory("/nonexistent-voyager-test".into(), false).unwrap_err();
        assert!(err.contains("/nonexistent-voyager-test"));
    }

    #[test]
    fn read_directory_reports_file_size_and_mtime() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("data.txt"), b"hello world").unwrap();

        let entries = read_directory(tmp.path().to_string_lossy().into_owned(), false).unwrap();
        let entry = entries.iter().find(|e| e.name == "data.txt").unwrap();
        assert_eq!(entry.size, Some(11));
        assert!(entry.mtime.is_some());
    }

    #[test]
    fn read_directory_directory_size_is_none() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("sub")).unwrap();

        let entries = read_directory(tmp.path().to_string_lossy().into_owned(), false).unwrap();
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

        let entries = read_directory(tmp.path().to_string_lossy().into_owned(), false).unwrap();
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
    fn copy_entry_copies_file() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("a.txt");
        fs::write(&src, b"hello").unwrap();
        let target = tmp.path().join("sub");
        fs::create_dir(&target).unwrap();

        let new_path = copy_entry(
            src.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .unwrap();

        assert!(src.exists());
        assert_eq!(Path::new(&new_path), target.join("a.txt"));
        assert_eq!(fs::read(&new_path).unwrap(), b"hello");
    }

    #[test]
    fn copy_entry_copies_directory_recursively() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src_dir");
        fs::create_dir(&src).unwrap();
        fs::create_dir(src.join("nested")).unwrap();
        fs::write(src.join("nested").join("file.txt"), b"content").unwrap();
        let target = tmp.path().join("target_dir");
        fs::create_dir(&target).unwrap();

        let new_path = copy_entry(
            src.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .unwrap();

        assert!(src.exists());
        let copied_file = Path::new(&new_path).join("nested").join("file.txt");
        assert_eq!(fs::read(&copied_file).unwrap(), b"content");
    }

    #[test]
    fn copy_entry_collision_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("b.txt");
        touch(&src);
        let target = tmp.path().join("sub");
        fs::create_dir(&target).unwrap();
        touch(&target.join("b.txt"));

        let err = copy_entry(
            src.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .unwrap_err();

        assert!(err.contains("already exists"));
    }

    #[test]
    fn copy_entry_folder_into_itself_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let sub = tmp.path().join("sub");
        fs::create_dir(&sub).unwrap();

        let err = copy_entry(
            sub.to_string_lossy().into_owned(),
            sub.to_string_lossy().into_owned(),
        )
        .unwrap_err();

        assert_eq!(err, "Cannot copy a folder into itself");
    }

    #[test]
    fn copy_entry_missing_source_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("sub");
        fs::create_dir(&target).unwrap();

        let err = copy_entry(
            tmp.path()
                .join("nonexistent")
                .to_string_lossy()
                .into_owned(),
            target.to_string_lossy().into_owned(),
        )
        .unwrap_err();

        assert!(err.contains("Cannot access"));
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
    fn create_entry_leading_dot_succeeds() {
        let tmp = tempfile::tempdir().unwrap();
        let path = create_entry(
            tmp.path().to_string_lossy().into_owned(),
            ".hidden".into(),
            false,
        )
        .unwrap();
        assert!(Path::new(&path).is_file());
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

    #[test]
    fn settings_file_path_uses_exe_dir_for_plain_exe() {
        let path = settings_file_path(Path::new("/opt/voyager/voyager")).unwrap();
        assert_eq!(path, Path::new("/opt/voyager/voyager.json"));
    }

    #[test]
    fn settings_file_path_resolves_next_to_macos_bundle() {
        let exe = Path::new("/Applications/Voyager.app/Contents/MacOS/voyager");
        assert_eq!(
            settings_file_path(exe).unwrap(),
            Path::new("/Applications/voyager.json")
        );
    }

    #[test]
    fn settings_file_path_dev_mode_uses_target_dir() {
        let exe = Path::new("/repo/src-tauri/target/debug/voyager");
        assert_eq!(
            settings_file_path(exe).unwrap(),
            Path::new("/repo/src-tauri/target/debug/voyager.json")
        );
    }

    #[test]
    fn settings_file_path_near_miss_bundle_falls_back_to_exe_dir() {
        // MacOS dir without a Contents parent.
        let exe = Path::new("/x/MacOS/voyager");
        assert_eq!(
            settings_file_path(exe).unwrap(),
            Path::new("/x/MacOS/voyager.json")
        );
        // Contents/MacOS whose grandparent lacks the .app extension.
        let exe = Path::new("/x/Foo/Contents/MacOS/voyager");
        assert_eq!(
            settings_file_path(exe).unwrap(),
            Path::new("/x/Foo/Contents/MacOS/voyager.json")
        );
    }

    #[test]
    fn settings_file_path_bundle_at_root_resolves() {
        let exe = Path::new("/Voyager.app/Contents/MacOS/voyager");
        assert_eq!(settings_file_path(exe).unwrap(), Path::new("/voyager.json"));
    }

    #[test]
    fn remove_settings_deletes_existing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("voyager.json");
        touch(&path);

        remove_settings(&path).unwrap();

        assert!(!path.exists());
    }

    #[test]
    fn remove_settings_missing_file_is_ok() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(remove_settings(&tmp.path().join("voyager.json")).is_ok());
    }
}
