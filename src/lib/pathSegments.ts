export interface PathSegment {
  name: string; // display label; "/" for the root segment
  path: string; // absolute path this segment navigates to
}

// "/Users/foo/bar"  → [{name:"/",path:"/"},{name:"Users",path:"/Users"},
//                      {name:"foo",path:"/Users/foo"},{name:"bar",path:"/Users/foo/bar"}]
// "/"               → [{name:"/",path:"/"}]
// trailing slash tolerated: "/Users/" === "/Users"
// "" (not yet loaded) → []
export function splitPathSegments(path: string): PathSegment[] {
  if (path === "") return [];

  const segments: PathSegment[] = [{ name: "/", path: "/" }];
  let acc = "";
  for (const name of path.split("/").filter(Boolean)) {
    acc += `/${name}`;
    segments.push({ name, path: acc });
  }
  return segments;
}

// "/a/b/c" → "/a/b", "/a" → "/", "/" → null (already at root). POSIX only.
// Trailing slash tolerated: "/a/b/" behaves like "/a/b".
export function parentPath(path: string): string | null {
  const segments = splitPathSegments(path);
  return segments.length <= 1 ? null : segments[segments.length - 2].path;
}
