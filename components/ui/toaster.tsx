'use client'

import { useToast } from '@/hooks/use-toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider label="Caizen feedback">
      {toasts.map(function (toastItem) {
        const { id, title, description, action, feedbackGroup, feedbackMobileTitle, ...props } = toastItem;
        delete props.feedbackPriority;
        return (
          <Toast key={id} data-feedback-group={feedbackGroup} {...props}>
            <div className="grid min-w-0 flex-1 gap-1 [overflow-wrap:anywhere]">
              {feedbackMobileTitle ? <ToastTitle className="caizen-routine-toast-mobile-title">{feedbackMobileTitle}</ToastTitle> : null}
              {title && <ToastTitle className={feedbackMobileTitle ? 'caizen-routine-toast-desktop-title' : undefined}>{title}</ToastTitle>}
              {description && (
                <ToastDescription className={feedbackGroup === 'routine' ? 'caizen-routine-toast-description' : undefined}>
                  {description}
                </ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
