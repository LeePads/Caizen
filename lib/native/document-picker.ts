export type PickedDocument = {
  file: File;
  fileName: string;
  mimeType: string;
};

export function browseForDocument(accept = '*/*'): Promise<PickedDocument | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { file, fileName: file.name, mimeType: file.type } : null);
    };
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
