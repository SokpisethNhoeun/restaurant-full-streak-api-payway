export function AppLoading({ label = 'Loading...' }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </main>
  );
}
