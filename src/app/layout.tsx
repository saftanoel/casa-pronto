import type { Metadata } from "next";
import QueryProvider from "@/providers/QueryProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SITE_URL } from "@/lib/constants";
import "../index.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Casa Pronto Imobiliare",
  description: "Apartamente, case, terenuri de vanzare in Alba Iulia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro">
      <body className="min-h-screen bg-background font-sans antialiased flex flex-col">
        <QueryProvider>
          <Header />
          <main className="flex-1">
            {children}
          </main>
          <Footer />
        </QueryProvider>
      </body>
    </html>
  );
}
