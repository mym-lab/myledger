// Browser check of the accountant -> client -> staff flow.
// Manual: needs the backend on :5055 and the frontend dev server on :3000 (pointed at :5055),
// with a firm account seeded first:  DB_PATH=<db> node test/seed-ui.mjs
// Run:  PLAYWRIGHT_PATH=<path to playwright package> SCREENSHOT_DIR=<dir> node test/ui-flow.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const dir = (process.env.SCREENSHOT_DIR || '.').replace(/\/?$/, '/');
const t = Date.now().toString(36);
const userId = 'uibiz' + t;
const step = (m) => console.log('• ' + m);
const fail = (m) => console.log('FAIL ' + m);
(async () => {
  const b = await chromium.launch();
  // ── Firm signs in
  const firm = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errs = []; firm.on('pageerror', e => errs.push(e.message));
  await firm.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await firm.getByPlaceholder('Email or User ID').fill('uifirm@t.com');
  await firm.locator('input[type=password]').fill('Test1234!');
  await firm.getByRole('button', { name: 'Sign In', exact: true }).last().click();
  await firm.waitForTimeout(2500);
  await firm.getByText('Skip', { exact: true }).click({ timeout: 4000 }).catch(() => {});
  await firm.waitForTimeout(800);
  step('firm signed in: ' + (await firm.locator('body').innerText()).slice(0, 0));
  await firm.getByText('Overview', { exact: false }).first().click().catch(()=>{});
  await firm.getByText('Portfolio', { exact: true }).first().click().catch(e => fail('open Portfolio: ' + e.message.split('\n')[0]));
  await firm.waitForTimeout(800);
  await firm.getByRole('button', { name: /New Client Account/ }).click().catch(e => fail('New Client Account button: ' + e.message.split('\n')[0]));
  const fill = (label, val) => firm.locator(`(//*[normalize-space(text())="${label}"]/following::input)[1]`).fill(val);
  await fill('Business name *', 'Juan Sari-Sari Store');
  await fill('TIN *', '123-456-789-000');
  await fill('User ID for their login *', userId);
  await fill('Temporary password *', 'Temp1234');
  await firm.screenshot({ path: dir + '1-new-client-modal.png' });
  await firm.getByRole('button', { name: 'Create Account' }).click();
  await firm.waitForTimeout(1500);
  const created = await firm.getByText('Client account created').count();
  created ? step('client account created') : fail('success panel not shown');
  await firm.screenshot({ path: dir + '2-client-created.png' });
  await firm.getByRole('button', { name: 'Done' }).click().catch(() => {});

  // ── Client signs in with the User ID
  const cctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const client = await cctx.newPage();
  client.on('pageerror', e => errs.push('client: ' + e.message));
  await client.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await client.getByPlaceholder('Email or User ID').fill(userId);
  await client.locator('input[type=password]').fill('Temp1234');
  await client.getByRole('button', { name: 'Sign In', exact: true }).last().click();
  await client.waitForTimeout(1500);
  await client.getByText('Skip', { exact: true }).click({ timeout: 2000 }).catch(() => {});
  const forced = await client.locator('input[type=password]').count();
  forced >= 2 ? step('client forced into password change screen') : fail('no forced password change screen');
  await client.screenshot({ path: dir + '3-forced-password.png' });
  const pwFields = client.locator('input[type=password]');
  await pwFields.nth(0).fill('MyOwn123');
  await pwFields.nth(1).fill('MyOwn123');
  await client.locator('input[type=checkbox]').first().check().catch(e => fail('consent checkbox: ' + e.message.split('\n')[0]));
  await client.getByRole('button', { name: /Save|Change|Continue|Update|Set/ }).first().click().catch(e => fail('submit password: ' + e.message.split('\n')[0]));
  await client.waitForTimeout(2500);
  await client.getByText('Skip', { exact: true }).click({ timeout: 2000 }).catch(() => {});
  const stillForced = await client.locator('input[type=password]').count();
  stillForced === 0 ? step('password changed, client in the app') : fail('still on password screen');
  await client.screenshot({ path: dir + '4-client-home.png' });

  // ── Firm assigns the client to a staff member on My Team
  await firm.getByText('Settings', { exact: false }).first().click().catch(()=>{});
  await firm.getByText('My Team', { exact: true }).first().click().catch(e => fail('open My Team: ' + e.message.split('\n')[0]));
  await firm.waitForTimeout(1200);
  await firm.waitForTimeout(1500);
  await firm.screenshot({ path: dir + '5a-team.png' });
  console.log('TEAM TEXT: ' + (await firm.locator('body').innerText()).split('\n').filter(l=>l.trim()).slice(-40).join(' | '));
  const chip = firm.getByText('Juan Sari-Sari Store').last();
  await chip.click().catch(e => fail('team client chip: ' + e.message.split('\n')[0]));
  await firm.waitForTimeout(1200);
  await firm.screenshot({ path: dir + '5-team-assign.png' });
  const cnt = async () => ((await firm.locator('body').innerText()).match(/Staff · (\d+) client/) || [])[1];
  const afterAdd = await cnt();
  afterAdd === '1' ? step('assign: staff now has 1 client') : fail('assign count after add = ' + afterAdd);
  await firm.getByText('Juan Sari-Sari Store').last().click().catch(() => {});
  await firm.waitForTimeout(1200);
  await firm.screenshot({ path: dir + '6-team-unassign.png' });
  const afterRemove = await cnt();
  afterRemove === '0' ? step('unassign: staff back to 0 clients') : fail('count after remove = ' + afterRemove);

  console.log('page errors: ' + (errs.length ? errs.slice(0,5).join(' | ') : 'none'));
  await b.close();
})().catch(e => { console.error('CRASH ' + e.message.split('\n')[0]); process.exit(1); });
