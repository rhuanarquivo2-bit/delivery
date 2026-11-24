export default function LojaNaoEncontrada() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-bold">Loja não encontrada</h1>
      <p className="text-muted-foreground">Confira se o endereço está correto.</p>
    </main>
  );
}
