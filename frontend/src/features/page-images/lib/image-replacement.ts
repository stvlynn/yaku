interface AttributeSnapshot {
  node: HTMLImageElement | HTMLSourceElement;
  src: string | null;
  srcset: string | null;
  sizes: string | null;
}
const names = ["src", "srcset", "sizes"] as const;
export function createImageReplacement(
  image: HTMLImageElement,
  mutate: (action: () => void) => void,
) {
  const url = image.currentSrc || image.src;
  const sourceNodes = () => [
    image,
    ...Array.from(image.closest("picture")?.querySelectorAll("source") ?? []),
  ];
  const attributes: AttributeSnapshot[] = sourceNodes().map((node) => ({
    node,
    src: node.getAttribute("src"),
    srcset: node.getAttribute("srcset"),
    sizes: node.getAttribute("sizes"),
  }));
  const sameSourceNodes = () => {
    const current = sourceNodes();
    return (
      current.length === attributes.length &&
      current.every((node, index) => node === attributes[index]!.node)
    );
  };
  let live = true;
  let replacement: string | undefined;
  function sourceIntact() {
    return (
      image.isConnected &&
      sameSourceNodes() &&
      (image.currentSrc || image.src) === url &&
      attributes.every(({ node, ...values }) =>
        names.every((name) => node.getAttribute(name) === values[name]),
      )
    );
  }
  function rollback() {
    if (!replacement) return;
    // A page-owned src change starts a new source version; never revive its old srcset.
    if (image.getAttribute("src") === replacement)
      mutate(() => {
        for (const snapshot of attributes) {
          const { node } = snapshot;
          const pristine =
            node.getAttribute("src") ===
              (node === image ? replacement : snapshot.src) &&
            node.getAttribute("srcset") === "" &&
            node.getAttribute("sizes") === "";
          for (const name of names) {
            if (name === "src" ? node !== image : !pristine) continue;
            const value = snapshot[name];
            if (value === null) node.removeAttribute(name);
            else node.setAttribute(name, value);
          }
        }
      });
    replacement = undefined;
  }
  return {
    url,
    get live() {
      return live;
    },
    sourceIntact,
    isReplacement() {
      return (
        replacement !== undefined &&
        sameSourceNodes() &&
        image.getAttribute("src") === replacement &&
        attributes.every(
          ({ node, src }) =>
            node.getAttribute("src") === (node === image ? replacement : src) &&
            node.getAttribute("srcset") === "" &&
            node.getAttribute("sizes") === "",
        )
      );
    },
    async apply(result: string, valid: () => boolean) {
      if (!live || !valid() || !sourceIntact()) return false;
      replacement = result;
      mutate(() => {
        for (const { node } of attributes) {
          node.setAttribute("srcset", "");
          node.setAttribute("sizes", "");
        }
        image.src = result;
      });
      try {
        if (image.decode) await image.decode();
      } catch (error) {
        rollback();
        throw error;
      }
      if (!live || !valid()) {
        rollback();
        return false;
      }
      return true;
    },
    rollback,
    restore() {
      if (!live) return;
      live = false;
      rollback();
    },
  };
}
export async function readBlobImage(url: string): Promise<string | undefined> {
  if (!url.startsWith("blob:")) return;
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
