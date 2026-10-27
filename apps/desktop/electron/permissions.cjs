function audioPermissionAllowed(
  appUrl,
  requestingOrigin,
  permission,
  details = {},
) {
  if (details.isMainFrame !== true) return false;
  try {
    if (new URL(requestingOrigin).origin !== new URL(appUrl).origin)
      return false;
  } catch {
    return false;
  }
  if (permission === "speaker-selection") return true;
  if (permission !== "media") return false;
  const types =
    details.mediaTypes || (details.mediaType ? [details.mediaType] : []);
  return types.length > 0 && types.every((type) => type === "audio");
}
module.exports = { audioPermissionAllowed };
