function isAllowedApiRequest(path, method = "GET") {
  return (
    typeof path === "string" &&
    path.length <= 4000 &&
    /^\/(?:auth|catalog|admin|orders|track|health|staff|delivery-areas|address|courier)(?:[/?]|$)/.test(
      path,
    ) &&
    !path.includes("..") &&
    !path.includes("://") &&
    !/[\\#\x00-\x1f]/.test(path) &&
    !/%(?:2e|2f|5c)/i.test(path.split("?")[0]) &&
    ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)
  );
}
module.exports = { isAllowedApiRequest };
