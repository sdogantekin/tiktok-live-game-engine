import { type BrowserContext, expect, type Page } from '@playwright/test';

export const OPERATOR_TOKEN = 'e2e-operator-token';

export async function openOperator(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/operator/#token=${OPERATOR_TOKEN}`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  return page;
}

export async function openBroadcast(context: BrowserContext, query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/broadcast/${query}`);
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.locator('.team-name').first()).toBeVisible(); // first snapshot has arrived
  return page;
}

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** The server is shared by all tests, so every test starts by stopping any running game and starting a clean one. */
export async function startFreshGame(operator: Page): Promise<void> {
  const stop = button(operator, 'Stop game');
  if (await stop.isEnabled()) await stop.click();
  await expect(operator.getByTestId('phase')).toHaveText('stopped');
  await button(operator, 'Start game').click();
  await expect(operator.getByTestId('phase')).toHaveText('countdown');
}

export async function playerCount(operator: Page): Promise<number> {
  const heading = await operator.getByRole('heading', { name: /^Players \(\d+\)$/ }).textContent();
  return Number(/\((\d+)\)/.exec(heading ?? '')?.[1]);
}

export async function addViewers(operator: Page, count: number): Promise<void> {
  const before = await playerCount(operator);
  await operator.getByLabel('Viewers to add').fill(String(count));
  await button(operator, 'Add').click();
  await expect.poll(() => playerCount(operator), { timeout: 10_000 }).toBe(before + count);
}

export async function startRoundWithScores(operator: Page, viewers: number): Promise<void> {
  await startFreshGame(operator);
  await addViewers(operator, viewers);
  await button(operator, 'Start round now').click();
  await expect(operator.getByTestId('phase')).toHaveText('active');

  await operator.getByLabel('Burst viewers').fill(String(viewers));
  await operator.getByLabel('Burst spread ms').fill('0');
  await operator.getByLabel('Burst word').selectOption('halay');
  await button(operator, 'Send burst').click();
}

export async function scores(page: Page): Promise<{ gelin: number; damat: number }> {
  const read = async (id: string) => Number(await page.getByTestId(`score-${id}`).textContent());
  return { gelin: await read('gelin'), damat: await read('damat') };
}
