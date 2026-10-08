import { describe, expect, it, vi } from 'vitest';
import { fetchWalletImageFromUrl, getWalletImageFromPaste, normalizeWalletImageUrl } from '@/lib/wallet-image';

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('wallet image acquisition', () => {
  it('accepts HTTPS image URLs and converts the response to a managed-media input', async () => {
    const image = new Blob([pngBytes], { type: 'image/png' });
    const result = await fetchWalletImageFromUrl('https://images.example.test/wallet', vi.fn().mockResolvedValue({ ok: true, url: 'https://images.example.test/wallet', blob: async () => image }));

    expect(result.fileName).toBe('wallet-url.png');
    expect(result.blob).toBe(image);
    expect(normalizeWalletImageUrl('http://images.example.test/wallet')).toBeNull();
  });

  it('rejects invalid URL responses before creating pending image state', async () => {
    await expect(fetchWalletImageFromUrl('not-a-url', vi.fn())).rejects.toThrow('valid HTTPS image URL');
    await expect(fetchWalletImageFromUrl('https://images.example.test/wallet', vi.fn().mockResolvedValue({ ok: true, url: 'https://images.example.test/wallet', blob: async () => new Blob(['text'], { type: 'text/plain' }) }))).rejects.toThrow('did not return an image');
    await expect(fetchWalletImageFromUrl('https://images.example.test/wallet', vi.fn().mockResolvedValue({ ok: false, url: 'https://images.example.test/wallet', blob: async () => new Blob() }))).rejects.toThrow('could not be loaded');
  });

  it('extracts image clipboard items and ignores text-only paste', () => {
    const file = new File([pngBytes], 'screenshot.png', { type: 'image/png' });
    const imageEvent = { clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] } } as unknown as ClipboardEvent;
    const textEvent = { clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] } } as unknown as ClipboardEvent;

    expect(getWalletImageFromPaste(imageEvent)?.fileName).toBe('screenshot.png');
    expect(getWalletImageFromPaste(textEvent)).toBeNull();
  });

  it('keeps wallet media concerns separate from accounting records', async () => {
    const source = await import('@/components/modals/WalletModal');
    expect(source.default).toBeTypeOf('function');
    const fs = await import('node:fs');
    const balanceSection = fs.readFileSync('components/sections/BalanceSection.tsx', 'utf8');
    const walletModal = fs.readFileSync('components/modals/WalletModal.tsx', 'utf8');
    expect(balanceSection).toContain('updateWallet(walletId, {');
    expect(balanceSection).toContain('scheduleMediaCleanup');
    expect(balanceSection).toContain("reason: 'draft-cancelled'");
    expect(balanceSection).toContain("reason: 'record-deleted'");
    expect(balanceSection).toContain('walletFields');
    expect(balanceSection).toContain('createdWalletId');
    expect(balanceSection).toContain('deleteWallet(createdWalletId)');
    expect(balanceSection).toContain('imageAttached');
    expect(balanceSection).toContain('if (!removed)');
    expect(balanceSection).not.toContain('processPendingMediaCleanup');
    expect(balanceSection).not.toContain('transactions: []');
    expect(walletModal).toContain('setSaveBusy(true)');
    expect(walletModal).toContain('disabled={!name.trim() || saveBusy || imageBusy || photoSource.busy}');
  });
});
