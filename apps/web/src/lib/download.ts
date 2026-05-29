export const createExportDownloadFilename = (projectId: string): string =>
  `shopclip-${projectId}-export.mp4`;

export const triggerBrowserDownload = (
  downloadUrl: string,
  filename: string,
  targetDocument: Document | undefined =
    typeof document === "undefined" ? undefined : document,
): boolean => {
  if (!targetDocument?.body) {
    return false;
  }

  const anchor = targetDocument.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  anchor.target = "_blank";
  anchor.style.display = "none";
  targetDocument.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
};
