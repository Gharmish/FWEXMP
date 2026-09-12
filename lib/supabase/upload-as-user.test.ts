import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
const env = vi.hoisted(() => ({ SUPABASE_SERVICE_ROLE_KEY: 'service-key' as string | undefined }));
vi.mock('@/lib/env', () => ({
  serverEnv: env,
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  },
  hasSupabaseAuth: () => true,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  session: { access_token: 'tok' } as { access_token: string } | null,
  userUploadError: null as { message: string; statusCode?: string } | null,
  serviceUploadError: null as { message: string } | null,
  uploads: [] as Array<{ via: string; bucket: string; key: string }>,
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      getSession: async () => ({ data: { session: state.session } }),
    },
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (objectKey: string) => {
          const via = key === 'service-key' ? 'service' : 'user';
          state.uploads.push({ via, bucket, key: objectKey });
          const error = via === 'user' ? state.userUploadError : state.serviceUploadError;
          return { error };
        },
      }),
    },
  }),
}));

import { uploadAsUser } from './server';

const file = new Blob(['x']);

beforeEach(() => {
  env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  state.user = { id: 'u1' };
  state.session = { access_token: 'tok' };
  state.userUploadError = null;
  state.serviceUploadError = null;
  state.uploads.length = 0;
  reportError.mockClear();
});

describe('uploadAsUser (SEC-06)', () => {
  it("writes a user-scoped bucket with the user's own token", async () => {
    const out = await uploadAsUser('avatars', { key: 'u1/a.png', file, contentType: 'image/png' });
    expect(out.error).toBeNull();
    expect(state.uploads).toEqual([{ via: 'user', bucket: 'avatars', key: 'u1/a.png' }]);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('falls back to the service key only on a policy refusal, and reports it', async () => {
    state.userUploadError = {
      message: 'new row violates row-level security policy',
      statusCode: '403',
    };
    const out = await uploadAsUser('kyc-documents', {
      key: 'u1/id.pdf',
      file,
      contentType: 'application/pdf',
    });
    expect(out.error).toBeNull();
    expect(state.uploads.map((u) => u.via)).toEqual(['user', 'service']);
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        surface: 'storage:uploadAsUser:rls-fallback',
        bucket: 'kyc-documents',
      }),
    );
  });

  it('a non-policy failure is an upload failure, not a service-key retry', async () => {
    state.userUploadError = { message: 'Payload too large', statusCode: '413' };
    const out = await uploadAsUser('avatars', { key: 'u1/a.png', file, contentType: 'image/png' });
    expect(out).toEqual({ storage: null, error: 'upload_failed' });
    expect(state.uploads.map((u) => u.via)).toEqual(['user']);
  });

  it('other buckets keep the service key; no session means no upload', async () => {
    await uploadAsUser('photos', {
      key: 'experiences/x/hero.jpg',
      file,
      contentType: 'image/jpeg',
    });
    expect(state.uploads).toEqual([
      { via: 'service', bucket: 'photos', key: 'experiences/x/hero.jpg' },
    ]);
    state.user = null;
    expect(
      await uploadAsUser('avatars', { key: 'u1/a.png', file, contentType: 'image/png' }),
    ).toEqual({
      storage: null,
      error: 'no_session',
    });
  });
});
