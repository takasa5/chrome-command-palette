// ストアに上げる zip に入れるファイルを決める。テストや開発用のファイルは入れない。

// files は extension/ からの相対パス。拡張機能が読み込むのは、extension/ 直下のページとスクリプト、manifest.json、icons/ の PNG、_locales/ の文言だけ。
// extension/ 直下に開発用のスクリプトを置くとそれも入るので、開発用は extension/ の外に置く。
export function selectPackageFiles(files) {
  return files
    .filter(
      (file) =>
        file === "manifest.json" ||
        /^[^/]+\.(js|html|css|svg)$/.test(file) ||
        /^icons\/[^/]+\.png$/.test(file) ||
        /^_locales\/[^/]+\/messages\.json$/.test(file),
    )
    .sort();
}

// manifest.json が指すファイル。
export function manifestReferences(manifest) {
  return [
    ...Object.values(manifest.icons ?? {}),
    manifest.background?.service_worker,
    manifest.options_ui?.page,
    ...Object.values(manifest.chrome_url_overrides ?? {}),
    ...(manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources),
    manifest.default_locale && `_locales/${manifest.default_locale}/messages.json`,
  ].filter(Boolean);
}

// HTML の src と href、JS の import、files: [...]、url: "..."、getURL(...) が指す、拡張機能の中のファイル。
// palette.html?focus のような後ろの指定と、先頭の ./ や / は落とす。
// import "playwright-core" のようなパッケージ名も返す。拡張機能では読み込めないので、isPackageName で見分けて止める。
export function sourceReferences(text) {
  const patterns = [
    /\b(?:src|href)="([^"]+)"/g,
    /\bfrom\s+"([^"]+)"/g,
    /\bimport\s+"([^"]+)"/g,
    /\bimport\s*\(\s*"([^"]+)"\s*\)/g,
    /\bgetURL\(\s*"([^"]+)"/g,
    /\bfiles:\s*\[\s*"([^"]+)"/g,
    // url: はタブやメニューの種類名にも使うので、拡張機能のページを指すものだけを見る。
    /\burl:\s*"([^"]+\.html(?:[?#][^"]*)?)"/g,
  ];
  const references = patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1]));
  return references
    .filter((reference) => !/^[a-z][a-z0-9+.-]*:/i.test(reference) && !reference.startsWith("#"))
    .map((reference) => reference.replace(/[?#].*$/, "").replace(/^\.?\//, ""))
    .filter((reference) => reference && !reference.endsWith("/"));
}

// 拡張子のない参照は、ファイルではなく npm のパッケージ名とみなす。
// Chrome はパッケージ名を解決できず、node_modules も zip に入らないので、拡張機能からは読み込めない。
export function isPackageName(reference) {
  return !/\.[a-z0-9]+$/i.test(reference);
}

// 参照しているのに zip に入らないファイル。
export function findMissingFiles(references, files) {
  const included = new Set(files);
  return [...new Set(references)].filter((reference) => !included.has(reference)).sort();
}
