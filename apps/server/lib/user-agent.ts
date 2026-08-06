/** Lightweight UA / device parsing for session lists (no extra deps). */

export type DeviceInfo = {
  deviceName: string;
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  raw: string | null;
};

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const raw = ua?.trim() || null;
  if (!raw) {
    return {
      deviceName: "Unknown device",
      browser: "Unknown",
      os: "Unknown",
      deviceType: "unknown",
      raw,
    };
  }

  const lower = raw.toLowerCase();

  let deviceType: DeviceInfo["deviceType"] = "desktop";
  if (/bot|crawl|spider|slurp|bingpreview/i.test(raw)) deviceType = "bot";
  else if (/ipad|tablet|kindle|playbook|silk|(android(?!.*mobile))/i.test(raw))
    deviceType = "tablet";
  else if (/mobi|iphone|ipod|android.*mobile|windows phone|opera mini/i.test(raw))
    deviceType = "mobile";

  let os = "Unknown";
  if (/windows nt 10/i.test(raw)) os = "Windows 10/11";
  else if (/windows nt 6\.3/i.test(raw)) os = "Windows 8.1";
  else if (/windows nt 6\.1/i.test(raw)) os = "Windows 7";
  else if (/windows/i.test(raw)) os = "Windows";
  else if (/android ([\d.]+)/i.test(raw)) {
    const m = /android ([\d.]+)/i.exec(raw);
    os = m ? `Android ${m[1]}` : "Android";
  } else if (/iphone os ([\d_]+)/i.test(raw) || /cpu os ([\d_]+)/i.test(raw)) {
    const m = /(?:iphone os|cpu os) ([\d_]+)/i.exec(raw);
    os = m ? `iOS ${m[1]!.replace(/_/g, ".")}` : "iOS";
  } else if (/mac os x ([\d_]+)/i.test(raw)) {
    const m = /mac os x ([\d_]+)/i.exec(raw);
    os = m ? `macOS ${m[1]!.replace(/_/g, ".")}` : "macOS";
  } else if (/cros/i.test(raw)) os = "Chrome OS";
  else if (/linux/i.test(raw)) os = "Linux";

  let browser = "Unknown";
  if (/edg\//i.test(raw)) {
    const m = /edg\/([\d.]+)/i.exec(raw);
    browser = m ? `Edge ${m[1]}` : "Edge";
  } else if (/opr\//i.test(raw) || /opera/i.test(raw)) {
    const m = /(?:opr|opera)\/([\d.]+)/i.exec(raw);
    browser = m ? `Opera ${m[1]}` : "Opera";
  } else if (/firefox\/([\d.]+)/i.test(raw)) {
    const m = /firefox\/([\d.]+)/i.exec(raw);
    browser = m ? `Firefox ${m[1]}` : "Firefox";
  } else if (/chrome\/([\d.]+)/i.test(raw) && !/edg\//i.test(raw)) {
    const m = /chrome\/([\d.]+)/i.exec(raw);
    browser = m ? `Chrome ${m[1]}` : "Chrome";
  } else if (/safari\//i.test(raw) && /version\/([\d.]+)/i.test(raw)) {
    const m = /version\/([\d.]+)/i.exec(raw);
    browser = m ? `Safari ${m[1]}` : "Safari";
  } else if (/msie |trident\//i.test(raw)) browser = "Internet Explorer";

  // Short browser name without full version for device name
  const browserShort = browser.replace(/ [\d.]+$/, "");
  const deviceName =
    deviceType === "bot"
      ? `Bot · ${browserShort}`
      : `${browserShort} on ${os}`;

  // silence unused
  void lower;

  return { deviceName, browser, os, deviceType, raw };
}
