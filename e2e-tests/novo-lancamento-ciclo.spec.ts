import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";

test.setTimeout(120_000);

let admin: SupabaseClient | undefined;
let master: MasterTestUser | undefined;

function futureDate(daysAhead = 2): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

async function openNewLaunch(page: Page): Promise<void> {
  await page.goto("/pagar", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Contas a Pagar" }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /novo lançamento/i }).first().click();
  await expect(page.getByRole("heading", { name: "Novo Lançamento" })).toBeVisible({ timeout: 15_000 });
}

async function pickSearchableOption(page: Page, triggerName: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: triggerName }).first().click();
  const options = page.locator(".max-h-60 button");
  await expect(options.first()).toBeVisible({ timeout: 15_000 });
  await options.first().click();
}

async function selectCategoryAndCostCenter(page: Page): Promise<void> {
  // A Categoria Contábil já vem pré-selecionada pelo app quando existe categoria do tipo escolhido;
  // o que falta preencher é o Centro de Custo, cujo seletor exibe o placeholder "Selecione...".
  await pickSearchableOption(page, /^Selecione\.\.\.$/);
}

async function fillLaunch(page: Page, amountDigits: string): Promise<void> {
  await page.getByRole("button", { name: "Despesa / Saída" }).click();
  await pickSearchableOption(page, "Selecione um cliente / fornecedor");
  await page.getByPlaceholder("0,00").first().fill(amountDigits);
  await page.getByRole("button", { name: "À Vista", exact: true }).click();
  const dueDate = page.getByText("Data de Vencimento", { exact: false }).first().locator("xpath=..").locator("input[type=date]");
  await dueDate.fill(futureDate());
  await selectCategoryAndCostCenter(page);

  const bankAccounts = page.getByRole("button").filter({ hasText: "Saldo Real:" });
  await expect(bankAccounts.first()).toBeVisible({ timeout: 15_000 });
  await bankAccounts.first().click();
}

async function createLaunch(page: Page, amountDigits: string, amountText: string) {
  await openNewLaunch(page);
  await fillLaunch(page, amountDigits);
  await page.getByRole("button", { name: "Salvar Registro" }).click();
  const outcome = page.getByText(/Lançamento cadastrado com sucesso!|Ocorreu um problema:|Por favor,|Selecione|O valor recebido/).last();
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  const observedMessage = (await outcome.textContent())?.trim() ?? "";
  test.info().annotations.push({ type: "Desfecho observado (criação)", description: observedMessage });
  await expect(page.getByText("Lançamento cadastrado com sucesso!", { exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: amountText });
  await expect(row.first()).toBeVisible({ timeout: 30_000 });
  return row.first();
}

test.beforeEach(async ({ page }) => {
  admin = createMasterAdminClient();
  master = await createMasterTestUser(admin);
  await signInAsMaster(page, master);
});

test.afterEach(async () => {
  if (admin && master) await cleanupMasterTestUser(admin, master.id);
  admin = undefined;
  master = undefined;
});

test("Master dá baixa em um lançamento em aberto", async ({ page }) => {
  const amountText = "3,07";
  const row = await createLaunch(page, "307", amountText);
  const dialogMessages: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogMessages.push(dialog.message());
    await dialog.accept();
  });

  await row.getByRole("button", { name: "Dar baixa" }).click();
  await expect(page.getByRole("heading", { name: "Operações de Baixa de Título" })).toBeVisible();
  await page.getByText("Dispensar comprovante", { exact: true }).click();
  await page.getByRole("button", { name: "Baixar Título" }).click();
  await expect(page.getByRole("heading", { name: "Confirmar Baixa de Título?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar e Baixar" }).click();

  await expect.poll(async () => {
    const matchingRows = page.getByRole("row").filter({ hasText: amountText });
    return dialogMessages.length > 0 || (await matchingRows.count()) === 0 || (await matchingRows.getByRole("button", { name: "Dar baixa" }).count()) === 0;
  }, { timeout: 30_000 }).toBe(true);

  const matchingRows = page.getByRole("row").filter({ hasText: amountText });
  const visibleRowText = (await matchingRows.first().textContent())?.trim() ?? "";
  const observedOutcome = dialogMessages[0] ?? (visibleRowText || "A linha do lançamento não aparece mais em Contas a Pagar.");
  test.info().annotations.push({ type: "Desfecho observado (baixa)", description: observedOutcome });
  expect(dialogMessages, `Erro de baixa exibido na interface: ${dialogMessages[0] ?? ""}`).toHaveLength(0);
  await expect(page.getByRole("heading", { name: "Operações de Baixa de Título" })).toBeHidden();
  if (await matchingRows.count()) {
    await expect(matchingRows.getByRole("button", { name: "Dar baixa" })).toHaveCount(0);
  }
});

test("Lançamento aprovado sai da fila de Contas a Pagar", async ({ page }) => {
  const amountText = "9,04";
  await createLaunch(page, "904", amountText);

  await page.goto("/lancamentos", { waitUntil: "domcontentloaded", timeout: 60_000 });
  const row = page.getByRole("row").filter({ hasText: amountText });
  await expect(row.first()).toBeVisible({ timeout: 30_000 });
  await row.first().getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar Aprovação" }).click();
  await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeHidden({ timeout: 30_000 });

  await page.goto("/pagar", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Contas a Pagar" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: amountText })).toHaveCount(0, { timeout: 30_000 });
});
