import { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPropertyById } from '@/lib/api/wordpress';

type Props = {
  params: Promise<{ id: string }>
}

function parsePropertyId(rawId: string): number | null {
  if (!rawId || !/^\d+$/.test(rawId)) {
    return null;
  }
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParams = await params;
  const propertyId = parsePropertyId(resolvedParams.id);
  if (propertyId === null) {
    notFound();
  }

  const property = await fetchPropertyById(propertyId);

  if (!property) {
    return {
      title: 'Property Not Found',
    };
  }

  const seo = property.seo || {};

  return {
    title: seo.title || property.title,
    description: seo.description || seo.og_description,
    openGraph: {
      title: seo.og_title || seo.title || property.title,
      description: seo.og_description || seo.description,
      images: seo.og_image ? [{ url: seo.og_image }] : undefined,
    },
    alternates: {
      canonical: seo.canonical_url,
    },
    robots: {
      index: !seo.noindex,
    }
  };
}

export default async function PropertyPage({ params }: Props) {
  const resolvedParams = await params;
  const propertyId = parsePropertyId(resolvedParams.id);
  if (propertyId === null) {
    notFound();
  }

  const property = await fetchPropertyById(propertyId);

  if (!property) {
    notFound();
  }

  return (
    <main className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl md:text-4xl font-bold mb-6" dangerouslySetInnerHTML={{ __html: property.title || '' }} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
           {property.images && property.images.length > 0 ? (
             <img src={property.images[0]} alt="Featured property image" className="w-full h-auto rounded-lg shadow-md object-cover aspect-video" />
           ) : (
             <div className="w-full aspect-video bg-slate-200 flex items-center justify-center rounded-lg shadow-inner">
               <span className="text-slate-500">No Image Available</span>
             </div>
           )}
        </div>
        
        <div>
           <div className="prose max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: property.description || '' }} />
           
           <div className="mt-8 bg-slate-50 p-6 rounded-lg border border-slate-100 shadow-sm">
              <h3 className="text-xl font-semibold mb-4 text-slate-800">Property Details</h3>
              <ul className="space-y-3">
                <li className="flex justify-between border-b border-slate-200 pb-2">
                  <strong className="text-slate-600">Price:</strong> 
                  <span className="font-medium">{property.price || 'N/A'}</span>
                </li>
                <li className="flex justify-between border-b border-slate-200 pb-2">
                  <strong className="text-slate-600">Bedrooms:</strong> 
                  <span className="font-medium">{property.beds || 'N/A'}</span>
                </li>
                <li className="flex justify-between border-b border-slate-200 pb-2">
                  <strong className="text-slate-600">Bathrooms:</strong> 
                  <span className="font-medium">{property.baths || 'N/A'}</span>
                </li>
                <li className="flex justify-between pb-2">
                  <strong className="text-slate-600">Area:</strong> 
                  <span className="font-medium">{property.area || 'N/A'} sqm</span>
                </li>
              </ul>
           </div>
        </div>
      </div>
    </main>
  );
}
