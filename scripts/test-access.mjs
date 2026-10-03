/**
 * Local access-model smoke test (Prompt 7).
 * Run: OTP_DEV_MODE=1 node --import tsx scripts/test-access.ts
 * Or via next server + curl (below uses HTTP against localhost:3000).
 */
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function otpLogin(phone) {
  const req = await fetch(`${BASE}/api/auth/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "request", phone }),
  });
  const { data } = await json(req);
  const code = data.devCode;
  if (!code) throw new Error(`No devCode for ${phone}: ${JSON.stringify(data)}`);
  const verifyRes = await fetch(`${BASE}/api/auth/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", phone, code }),
  });
  const cookie = cookieFrom(verifyRes);
  const verified = await json(verifyRes);
  return { cookie, ...verified.data };
}

async function stock(cookie, body) {
  const res = await fetch(`${BASE}/api/stock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return json(res);
}

async function business(cookie) {
  const res = await fetch(`${BASE}/api/business`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });
  return json(res);
}

async function main() {
  const ownerPhone = "+923001111001";
  const coPhone = "+923001111002";
  const staffAddPhone = "+923001111003";
  const staffViewPhone = "+923001111004";

  // Fresh owner via OTP — if already exists, still ok
  let owner = await otpLogin(ownerPhone);
  console.log("owner login", owner.role, owner.homePath, owner.needsSetup);

  if (owner.needsSetup) {
    const create = await fetch(`${BASE}/api/business`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: owner.cookie },
      body: JSON.stringify({ action: "create", name: "Access Test Store", language: "en" }),
    });
    const created = await json(create);
    console.log("created", create.status, created.data.role);
    owner = await otpLogin(ownerPhone);
  }

  const biz = await business(owner.cookie);
  console.log("owner biz role", biz.data.role, "home", biz.data.homePath);

  // Add co-owner, staff add, staff view
  const addCo = await stock(owner.cookie, {
    action: "addOwner",
    name: "Co Owner",
    phone: coPhone,
    access: "co",
  });
  console.log("addCo", addCo.status, addCo.data.error || "ok");

  const addStaffAdd = await stock(owner.cookie, {
    action: "addStaff",
    name: "Adder",
    phone: staffAddPhone,
    permission: "add",
  });
  console.log("addStaffAdd", addStaffAdd.status, addStaffAdd.data.error || "ok");

  const addStaffView = await stock(owner.cookie, {
    action: "addStaff",
    name: "Viewer",
    phone: staffViewPhone,
    permission: "view",
  });
  console.log("addStaffView", addStaffView.status, addStaffView.data.error || "ok");

  // Co-owner login
  const co = await otpLogin(coPhone);
  const coBiz = await business(co.cookie);
  console.log("co role/home", coBiz.data.role, coBiz.data.homePath);
  const coAddOwner = await stock(co.cookie, {
    action: "addOwner",
    name: "Should Fail",
    phone: "+923001111099",
    access: "equal",
  });
  console.log("co addOwner (expect 403)", coAddOwner.status, coAddOwner.data.error);
  const coReset = await fetch(`${BASE}/api/business`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: co.cookie },
    body: JSON.stringify({ action: "reset" }),
  });
  const coResetBody = await json(coReset);
  console.log("co reset (expect 403)", coReset.status, coResetBody.data.error);

  // Staff add
  const staffAdd = await otpLogin(staffAddPhone);
  const saBiz = await business(staffAdd.cookie);
  console.log("staff_add role/home", saBiz.data.role, saBiz.data.homePath);
  const saProduct = await stock(staffAdd.cookie, {
    action: "addProduct",
    name: "Staff Rice",
    category: "Staples",
    variant: "1 kg",
    location: "shop",
    quantity: 2,
    purchasePrice: 100,
  });
  console.log("staff_add product", saProduct.status, saProduct.data.error || "ok");
  const saReport = await stock(staffAdd.cookie, { action: "sendDailyReport" });
  console.log("staff_add report (expect 403)", saReport.status, saReport.data.error);

  // Staff view
  const staffView = await otpLogin(staffViewPhone);
  const svBiz = await business(staffView.cookie);
  console.log("staff_view role/home", svBiz.data.role, svBiz.data.homePath);
  const svProduct = await stock(staffView.cookie, {
    action: "addProduct",
    name: "Blocked",
    category: "X",
    variant: "",
    location: "shop",
    quantity: 1,
    purchasePrice: 10,
  });
  console.log("staff_view product (expect 403)", svProduct.status, svProduct.data.error);

  // Report recipients — owner phones only
  const report = await stock(owner.cookie, { action: "sendDailyReport" });
  console.log("report sentTo", report.status, report.data.sentTo);
  const staffPhones = [staffAddPhone, staffViewPhone].map((p) => p.replace(/\s/g, ""));
  const leaked = (report.data.sentTo || []).some((p) => staffPhones.includes(p.replace(/\s/g, "")));
  console.log("staff excluded from report", !leaked);

  console.log("DONE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
