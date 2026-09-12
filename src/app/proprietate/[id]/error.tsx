'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PropertyError({ error, reset }: ErrorProps) {
  useEffect(() => {
    if (error.digest) {
      console.error(`Property route error [digest: ${error.digest}]`);
    }
  }, [error]);

  return (
    <div className="container mx-auto p-4 md:p-8 min-h-[50vh] flex flex-col items-center justify-center text-center">
      <div className="max-w-md p-6 bg-white rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-3">
          Nu am putut încărca această proprietate
        </h2>
        <p className="text-slate-600 mb-6">
          A apărut o problemă de conectare la server. Vă rugăm să încercați din nou.
        </p>
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Reîncearcă
        </button>
      </div>
    </div>
  );
}
