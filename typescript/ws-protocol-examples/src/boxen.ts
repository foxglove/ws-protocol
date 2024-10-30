export default async function boxen(
  ...args: Parameters<(typeof import("boxen"))["default"]>
): Promise<string> {
  // Hack to import ESM-only module: https://github.com/microsoft/TypeScript/issues/43329
  // eslint-disable-next-line no-eval
  const importedBoxen = ((await eval("import('boxen')")) as typeof import("boxen")).default;
  return importedBoxen(...args);
}
