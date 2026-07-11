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
