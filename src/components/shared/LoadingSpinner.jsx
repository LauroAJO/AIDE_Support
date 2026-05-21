export default function LoadingSpinner({ label = 'Carregando...' }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-base text-ink2">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-accent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
