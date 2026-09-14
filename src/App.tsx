import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthContext';
import { RequireAuth, RequireAnonymous } from '@/auth/guards';
import { ToastProvider } from '@/components/ui/Toast';
import { LoadingBlock } from '@/components/ui/Button';
import { AppShell } from '@/layout/AppShell';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { ConnectionStatus } from '@/components/ConnectionStatus';

import LoginScreen from '@/routes/LoginScreen';
import SignupScreen from '@/routes/SignupScreen';
import HomeScreen from '@/routes/HomeScreen';
import SearchScreen from '@/routes/SearchScreen';
import PlacesScreen from '@/routes/PlacesScreen';
import PlaceDetailScreen from '@/routes/PlaceDetailScreen';
import StorageScreen from '@/routes/StorageScreen';
import ItemDetailScreen from '@/routes/ItemDetailScreen';
import ItemFormScreen from '@/routes/ItemFormScreen';
import MembersScreen from '@/routes/MembersScreen';
import FriendsScreen from '@/routes/FriendsScreen';
import ProfileScreen from '@/routes/ProfileScreen';
import ActivityScreen from '@/routes/ActivityScreen';
import InviteScreen from '@/routes/InviteScreen';
import NotFoundScreen from '@/routes/NotFoundScreen';

// Both pull in a sizeable library (camera decoding / QR rendering) that most
// sessions never touch — keep them out of the initial bundle.
const ScanScreen = lazy(() => import('@/routes/ScanScreen'));
const LabelSheetScreen = lazy(() => import('@/routes/LabelSheetScreen'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // The HTTP client already retries transient gateway failures with backoff
      // (see api/client.ts) and reports progress to <ConnectionStatus>. Retrying
      // again here would multiply that into a request storm against a server
      // that is merely asleep, so by the time an error reaches React Query it is
      // genuinely final.
      retry: false,
    },
    mutations: { retry: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* BASE_URL is '/FindMyStuff-FE/' on GitHub Pages and '/' in dev (see vite.config.ts). */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<LoadingBlock />}>
              <Routes>
                <Route element={<RequireAnonymous />}>
                  <Route path="/login" element={<LoginScreen />} />
                  <Route path="/signup" element={<SignupScreen />} />
                </Route>

                <Route element={<RequireAuth />}>
                  <Route element={<AppShell />}>
                    <Route index element={<HomeScreen />} />
                    <Route path="search" element={<SearchScreen />} />
                    <Route path="scan" element={<ScanScreen />} />
                    <Route path="scan/:labelCode" element={<ScanScreen />} />

                    <Route path="places" element={<PlacesScreen />} />
                    <Route path="places/:placeId" element={<PlaceDetailScreen />} />
                    <Route path="places/:placeId/labels" element={<LabelSheetScreen />} />
                    <Route path="places/:placeId/members" element={<MembersScreen />} />
                    <Route path="places/:placeId/activity" element={<ActivityScreen />} />
                    <Route path="places/:placeId/storages/:storageId" element={<StorageScreen />} />
                    <Route path="places/:placeId/items/new" element={<ItemFormScreen />} />
                    <Route path="places/:placeId/items/:itemId" element={<ItemDetailScreen />} />
                    <Route path="places/:placeId/items/:itemId/edit" element={<ItemFormScreen />} />

                    <Route path="friends" element={<FriendsScreen />} />
                    <Route path="profile" element={<ProfileScreen />} />
                    <Route path="invite" element={<InviteScreen />} />
                    <Route path="invite/:code" element={<InviteScreen />} />
                    <Route path="404" element={<NotFoundScreen />} />
                    <Route path="*" element={<NotFoundScreen />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
            <UpdatePrompt />
            <ConnectionStatus />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
