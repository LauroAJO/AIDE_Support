const ERROR_MESSAGES = {
  acesso_negado: 'Acesso negado. Esta conta não está autorizada a usar o Aide.',
};

export default function Login() {
  const errorCode = new URLSearchParams(window.location.search).get('error');
  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] || 'Não foi possível entrar. Tente novamente.'
    : null;

  const handleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-soft">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-ink">Aide</h1>
          <p className="mt-2 text-sm text-ink2">Suporte Executivo</p>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-center text-xs text-danger">
            {errorMessage}
          </div>
        )}

        <button
          onClick={handleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-accent px-4 py-3 font-medium text-white transition hover:bg-accent-hover"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#FFFFFF"
              d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.4-1.64 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.43l2.53-2.44C17.04 5.36 14.86 4.4 12.18 4.4 7.46 4.4 3.66 8.2 3.66 12.92s3.8 8.52 8.52 8.52c4.92 0 8.18-3.46 8.18-8.33 0-.56-.06-.99-.15-1.41z"
            />
          </svg>
          Entrar com Google
        </button>

        <p className="mt-6 text-center text-xs text-muted">
          Trabalho em equipe para alcançar o sucesso
        </p>
      </div>
    </div>
  );
}
