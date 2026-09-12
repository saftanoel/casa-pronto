import Link from 'next/link';

export default function PropertyNotFound() {
  return (
    <div className="container mx-auto p-4 md:p-8 min-h-[50vh] flex flex-col items-center justify-center text-center">
      <div className="max-w-md p-6 bg-white rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-3">
          Proprietatea nu a fost găsită
        </h2>
        <p className="text-slate-600 mb-6">
          Anunțul pe care îl căutați nu mai este disponibil sau nu există.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
        >
          Înapoi la pagina principală
        </Link>
      </div>
    </div>
  );
}
