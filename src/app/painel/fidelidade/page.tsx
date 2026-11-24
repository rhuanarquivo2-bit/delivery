import { Gift, MessageCircle, Trash2 } from "lucide-react";
import { deleteReward } from "@/app/painel/fidelidade/actions";
import { LoyaltySettingsForm, RewardForm } from "@/components/painel/fidelidade/loyalty-forms";
import { ToggleActive } from "@/components/painel/toggle-active";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { whatsappLink } from "@/lib/customers";
import { getMenu } from "@/lib/menu";
import { requireMyStore } from "@/lib/stores";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/utils";

export const metadata = { title: "Fidelidade" };

type Reward = { id: string; name: string; points_cost: number; kind: "product" | "percent"; percent: number | null; product_id: string | null; active: boolean };
type LoyalCustomer = {
  phone: string;
  name: string | null;
  balance: number;
  expiring_points: number;
  expiring_at: string | null;
  next_reward: string | null;
  missing: number | null;
  can_redeem: string | null;
};

const dateBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export default async function FidelidadePage() {
  const { store } = await requireMyStore();
  const supabase = await createClient();
  const [menu, { data: rewardRows }, { data: customerRows }] = await Promise.all([
    getMenu(store.id),
    supabase.from("loyalty_rewards").select("*").eq("store_id", store.id).order("points_cost"),
    supabase.rpc("loyalty_customers", { p_store_id: store.id }),
  ]);
  const rewards = (rewardRows ?? []) as Reward[];
  const customers = (customerRows ?? []) as LoyalCustomer[];
  const products = menu.flatMap((c) => c.products.map((p) => ({ id: p.id, name: p.name, category: c.name })));
  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? "Produto removido";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fidelidade</h1>
        <p className="text-muted-foreground">Pontos por compra, recompensas e clientes perto de ganhar.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Como funciona</CardTitle>
          <CardDescription>
            Os pontos entram quando o pedido é entregue e saem se ele for cancelado. O cliente vê o saldo em “Meus pedidos” e troca
            com um toque ao finalizar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoyaltySettingsForm
            enabled={store.loyalty_enabled}
            centsPerPoint={store.loyalty_cents_per_point}
            welcomePoints={store.loyalty_welcome_points}
            expiryDays={store.loyalty_expiry_days}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recompensas</CardTitle>
          <CardDescription>O que o cliente pode trocar pelos pontos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {rewards.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rewards.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Gift className="size-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.points_cost} pontos · {r.kind === "percent" ? `${r.percent}% de desconto` : `${productName(r.product_id)} grátis`}
                    </p>
                  </div>
                  <ToggleActive kind="reward" id={r.id} active={r.active} />
                  <form action={deleteReward}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      aria-label={`Apagar ${r.name}`}
                      className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma recompensa ainda. Crie a primeira abaixo.</p>
          )}
          <RewardForm products={products} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clientes com pontos</CardTitle>
          <CardDescription>Quem já pode trocar aparece primeiro, depois quem está mais perto da próxima recompensa.</CardDescription>
        </CardHeader>
        <CardContent>
          {customers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Cliente</th>
                    <th className="py-2 pr-3 font-medium">Pontos</th>
                    <th className="py-2 pr-3 font-medium">Situação</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customers.map((c) => {
                    const text = c.can_redeem
                      ? `Oi, ${c.name?.split(" ")[0] ?? ""}! Você já tem ${c.balance} pontos na ${store.name} e pode trocar por ${c.can_redeem}. É só escolher na hora de finalizar o pedido.`
                      : `Oi, ${c.name?.split(" ")[0] ?? ""}! Você tem ${c.balance} pontos na ${store.name}. Faltam só ${c.missing} para ${c.next_reward}!`;
                    return (
                      <tr key={c.phone}>
                        <td className="py-2.5 pr-3">
                          <p className="font-medium">{c.name ?? "Cliente"}</p>
                          <p className="text-xs text-muted-foreground">{formatPhone(c.phone)}</p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold">{c.balance}</p>
                          {c.expiring_at && c.expiring_points ? (
                            <p className="text-xs text-muted-foreground">
                              {c.expiring_points} vencem {dateBR(c.expiring_at)}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3">
                          {c.can_redeem ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              Pode trocar: {c.can_redeem}
                            </span>
                          ) : c.next_reward ? (
                            <span className="text-muted-foreground">
                              Faltam {c.missing} para {c.next_reward}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Sem recompensa cadastrada</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <a
                            href={whatsappLink(c.phone, text)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
                          >
                            <MessageCircle className="size-4" /> Avisar
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {store.loyalty_enabled
                ? "Ainda ninguém tem pontos. Eles entram quando os pedidos forem entregues."
                : "Ligue o programa para seus clientes começarem a juntar pontos."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
