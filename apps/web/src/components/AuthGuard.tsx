"use client";

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then(user => {
        // Evaluate route based on state
        if (!user.ageVerified && pathname !== '/onboarding/age') {
          router.push('/onboarding/age');
        } else if (user.ageVerified && !user.hasProfile && pathname !== '/onboarding/alias') {
          router.push('/onboarding/alias');
        } else if (user.ageVerified && user.hasProfile && !user.hasConsented && pathname !== '/onboarding/consent') {
          router.push('/onboarding/consent');
        } else if (user.ageVerified && user.hasProfile && user.hasConsented && pathname.startsWith('/onboarding')) {
          router.push('/app'); // All done
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        if (pathname !== '/login') {
          router.push('/login');
        } else {
          setLoading(false);
        }
      });
  }, [pathname, router]);

  // FIX: Render the dropped segment. 
  // We cannot drop {children} from the tree while loading, as this breaks instant navigation shell generation.
  // Instead, we render children but optionally hide or mask them.
  return (
    <>
      {loading && (
        <div className="fixed inset-0 min-h-screen flex items-center justify-center bg-slate-950 text-white z-50">
          Loading...
        </div>
      )}
      <div className={loading ? 'hidden' : 'contents'}>
        {children}
      </div>
    </>
  );
}
