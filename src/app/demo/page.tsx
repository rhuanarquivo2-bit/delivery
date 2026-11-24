import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Demonstração" };

export default function DemoPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Demonstração em construção</h1>
      <p className="max-w-md text-muted-foreground">
        Em breve você poderá testar a loja como cliente, operador e motoboy, com dados de exemplo.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Voltar
      </Link>
    </main>
  );
}
