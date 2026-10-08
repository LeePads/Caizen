'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CheckCircle2,
  Clock3,
  Lightbulb,
  Sparkles,
  Target,
  X,
} from 'lucide-react';

import { useAppContext } from '@/lib/context';

import { Button } from '@/components/ui/button';
import { AdaptiveDatePicker } from '@/components/ui/date-picker';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { AndroidAdaptiveSelect } from '@/components/native/android-design';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';


type EditableProductivityStatus =
  | 'pending'
  | 'in-progress'
  | 'deferred'
  | 'completed'
  | 'dropped';

function normalizeEditableStatus(
  value: string | null | undefined,
): EditableProductivityStatus {
  switch (value) {
    case 'in-progress':
    case 'deferred':
    case 'completed':
    case 'dropped':
      return value;
    case 'failed':
    case 'pending':
    default:
      return 'pending';
  }
}

interface ProductivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId?: string | null;
}

/* =========================================
   TYPES
========================================= */

const types = [
  {
    value: 'task',
    label: 'Task',
    icon: CheckCircle2,
  },

  {
    value: 'goal',
    label: 'Goal',
    icon: Target,
  },

  {
    value: 'idea',
    label: 'Idea',
    icon: Lightbulb,
  },

  {
    value: 'reminder',
    label: 'Reminder',
    icon: Clock3,
  },
];

const priorities = [
  'critical',
  'important',
  'normal',
  'optional',
];

type ProductivityFormValues = {
  title: string;
  description: string;
  type: 'task' | 'goal' | 'idea' | 'reminder';
  priority: 'critical' | 'important' | 'normal' | 'optional';
  status: EditableProductivityStatus;
  deadline: string;
};

const defaultValues: ProductivityFormValues = {
  title: '',
  description: '',
  type: 'task',
  priority: 'normal',
  status: 'pending',
  deadline: '',
};

/* =========================================
   STYLES
========================================= */

const inputStyle = `
  h-12
  w-full

  rounded-2xl

  border border-border

  bg-background/60

  px-4

  text-sm

  shadow-sm

  backdrop-blur-xl

  transition-all
  duration-300

  focus:border-primary/20
  focus:outline-none
  focus-visible:outline-2
  focus-visible:outline-offset-2
  focus-visible:outline-ring/60
  focus-visible:ring-0
`;

const textareaStyle = `
  min-h-[180px]
  w-full

  rounded-2xl

  border border-border

  bg-background/60

  px-4
  py-4

  text-sm
  leading-relaxed

  shadow-sm

  backdrop-blur-xl

  transition-all
  duration-300

  focus:border-primary/20
  focus:outline-none
  focus-visible:outline-2
  focus-visible:outline-offset-2
  focus-visible:outline-ring/60
  focus-visible:ring-0
`;

/* =========================================
   COMPONENT
========================================= */

export default function ProductivityModal({
  isOpen,
  onClose,
  itemId,
}: ProductivityModalProps) {
  const {
    addProductivityItem,
    productivityItems,
    updateProductivityItem,
  } = useAppContext();

  const item =
    itemId
      ? productivityItems.find(
          entry => entry.id === itemId
        )
      : null;

  const isEditMode =
    Boolean(itemId && item);

  const [title, setTitle] =
    useState('');

  const [description, setDescription] =
    useState('');

  const [type, setType] =
    useState<
      'task' |
      'goal' |
      'idea' |
      'reminder'
    >('task');

  const [priority, setPriority] =
    useState<
      'critical' |
      'important' |
      'normal' |
      'optional'
    >('normal');

  const [status, setStatus] =
    useState<EditableProductivityStatus>('pending');

  const [deadline, setDeadline] =
    useState('');

  const [showUnsavedDialog, setShowUnsavedDialog] =
    useState(false);

  const initialValues =
    useMemo(
      (): ProductivityFormValues => ({
        title: item?.title || '',
        description:
          item?.description || '',
        type:
          item?.type || defaultValues.type,
        priority:
          item?.priority || defaultValues.priority,
        status: normalizeEditableStatus(
          item?.status || defaultValues.status,
        ),
        deadline:
          item?.deadline
            ? new Date(item.deadline)
                .toISOString()
                .split('T')[0]
            : '',
      }),
      [item]
    );

  const resetForm = () => {
    setTitle(initialValues.title);
    setDescription(initialValues.description);
    setType(initialValues.type);
    setPriority(initialValues.priority);
    setStatus(initialValues.status);
    setDeadline(initialValues.deadline);
    setShowUnsavedDialog(false);
  };

  const hasUnsavedChanges =
    title !== initialValues.title ||
    description !== initialValues.description ||
    type !== initialValues.type ||
    priority !== initialValues.priority ||
    status !== initialValues.status ||
    deadline !== initialValues.deadline;

  const attemptClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
      return;
    }

    resetForm();
    onClose();
  };
  const modalPanelRef = useRef<HTMLDivElement>(null);
  useOverlayLifecycle(isOpen, attemptClose, { containerRef: modalPanelRef });

  useEffect(() => {
    if (!isOpen) return;

    resetForm();
  }, [
    isOpen,
    initialValues.title,
    initialValues.description,
    initialValues.type,
    initialValues.priority,
    initialValues.status,
    initialValues.deadline,
  ]);


  /* =========================================
     SUBMIT
  ========================================= */

  const handleSubmit = (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!title.trim()) return;

    const payload = {
      title,
      description,
      type,
      priority,
      status,
      deadline: deadline
        ? new Date(deadline)
        : undefined,
    };

    if (isEditMode && itemId) {
      updateProductivityItem(
        itemId,
        payload
      );
    } else {
      addProductivityItem(payload);
    }

    resetForm();
    onClose();
  };

  if (!isOpen || (itemId && !item)) return null;

  return (
    <div
      data-caizen-overlay="open"
      className="
        fixed inset-0
        z-[999]
      "
    >

      {/* BACKDROP */}
      <div
        className="
          absolute inset-0

          bg-black/50
          backdrop-blur-md
        "
      />

      {/* WRAPPER */}
      <div
        className="
          fixed inset-0

          flex
          items-center
          justify-center

          p-2
          sm:p-4
        "
      >

        {/* MODAL */}
        <div
          ref={modalPanelRef}
          tabIndex={-1}
          onClick={e =>
            e.stopPropagation()
          }
          className="
            relative

            flex
            h-[96dvh]
            w-full
            max-w-5xl

            flex-col
            overflow-hidden
            modal-card-enter

            rounded-[1.5rem]
            sm:rounded-[2.5rem]

            border border-border/50

            bg-card/95

            shadow-2xl

            backdrop-blur-2xl
          "
        >

          {/* GLOW */}
          <div
            className="
              absolute
              right-0
              top-0

              h-72
              w-72

              rounded-full

              bg-primary/5

              blur-3xl
            "
          />

          {/* HEADER */}
          <div
            className="
              relative
              shrink-0

              border-b border-border/50

              p-4
              sm:p-6
            "
          >

            <div
              className="
                flex
                items-start
                justify-between
                gap-4
              "
            >

              <div>

                <div
                  className="
                    inline-flex
                    items-center
                    gap-2

                    rounded-full

                    border border-primary/10

                    bg-primary/5

                    px-3
                    py-1

                    text-xs
                    font-semibold
                    tracking-wider

                    text-primary
                  "
                >

                  <Sparkles className="h-3 w-3" />

                  PRODUCTIVITY SYSTEM

                </div>

                <h2
                  className="
                    mt-5

                    text-2xl
                    sm:text-4xl
                    font-black
                    tracking-tight
                  "
                >

                  {isEditMode
                    ? 'Edit Item'
                    : 'Add New Item'}

                </h2>

                <p
                  className="
                    mt-3

                    text-sm
                    leading-relaxed

                    text-muted-foreground
                  "
                >

                  {isEditMode
                    ? 'Update your task, idea, reminder, or goal.'
                    : 'Capture tasks, reminders, ideas, and goals in one focused space.'}

                </p>

              </div>

              <button
                onClick={attemptClose}
                className="
                  rounded-2xl

                  border border-border

                  bg-background/60

                  p-3

                  text-muted-foreground

                  transition-all

                  hover:text-foreground
                "
              >

                <X className="h-5 w-5" />

              </button>

            </div>

          </div>

          {/* FORM */}
          <form
            onSubmit={
              handleSubmit
            }
            className="
              flex
              min-h-0
              flex-1
              flex-col
            "
          >

            {/* CONTENT */}
            <div
              className="
                min-h-0
                flex-1
                overflow-y-auto

                px-4
                py-4
                sm:px-6
                sm:py-6
              "
            >

              <div
                className="
                  grid
                  grid-cols-1
                  gap-5
                  xl:gap-8

                  xl:grid-cols-[1fr_340px]
                "
              >

                {/* LEFT */}
                <div className="space-y-6">

                  {/* TITLE */}
                  <div>

                    <label
                      className="
                        text-sm
                        font-medium
                        text-muted-foreground
                      "
                    >

                      Title

                    </label>

                    <input
                      value={title}
                      onChange={e =>
                        setTitle(
                          e.target.value
                        )
                      }
                      placeholder="What needs your attention?"
                      className={`${inputStyle} mt-3`}
                    />

                  </div>

                  {/* DESCRIPTION */}
                  <div>

                    <label
                      className="
                        text-sm
                        font-medium
                        text-muted-foreground
                      "
                    >

                      Description

                    </label>

                    <textarea
                      value={
                        description
                      }
                      onChange={e =>
                        setDescription(
                          e.target.value
                        )
                      }
                      placeholder="Add more context..."
                      className={`${textareaStyle} mt-3`}
                    />

                  </div>

                </div>

                {/* RIGHT */}
                <div className="space-y-6">

                  {/* TYPE */}
                  <section
                    className="
                      rounded-[2rem]

                      border border-border

                      bg-background/40

                      p-5
                    "
                  >

                    <h3
                      className="
                        text-sm
                        font-semibold
                        uppercase
                        tracking-wider

                        text-muted-foreground
                      "
                    >

                      Item Type

                    </h3>

                    <div className="mt-5 space-y-3">

                      {types.map(
                        item => {
                          const Icon =
                            item.icon;

                          const active =
                            type ===
                            item.value;

                          return (

                            <button
                              key={
                                item.value
                              }
                              type="button"
                              onClick={() =>
                                setType(
                                  item.value as any
                                )
                              }
                              className={`
                                flex
                                w-full
                                items-center
                                gap-4

                                rounded-2xl

                                border

                                px-4
                                py-4

                                text-left

                                transition-all

                                ${
                                  active
                                    ? `
                                      border-primary/20
                                      bg-primary/10
                                    `
                                    : `
                                      border-border
                                      bg-background/40
                                    `
                                }
                              `}
                            >

                              <div
                                className="
                                  flex
                                  h-12
                                  w-12
                                  items-center
                                  justify-center

                                  rounded-2xl

                                  bg-background
                                "
                              >

                                <Icon className="h-5 w-5" />

                              </div>

                              <div>

                                <p className="font-medium">

                                  {item.label}

                                </p>

                              </div>

                            </button>
                          );
                        }
                      )}

                    </div>

                  </section>

                  {/* PRIORITY */}
                  <section
                    className="
                      rounded-[2rem]

                      border border-border

                      bg-background/40

                      p-5
                    "
                  >

                    <h3
                      className="
                        text-sm
                        font-semibold
                        uppercase
                        tracking-wider

                        text-muted-foreground
                      "
                    >

                      Priority

                    </h3>

                    <div className="mt-5 flex flex-wrap gap-3">

                      {priorities.map(
                        p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() =>
                              setPriority(
                                p as any
                              )
                            }
                            className={`
                              rounded-2xl

                              border

                              px-4
                              py-3

                              text-sm
                              font-medium

                              capitalize

                              transition-all

                              ${
                                priority ===
                                p
                                  ? `
                                    border-primary/20
                                    bg-primary
                                    text-primary-foreground
                                  `
                                  : `
                                    border-border
                                    bg-background/50
                                  `
                              }
                            `}
                          >

                            {p}

                          </button>
                        )
                      )}

                    </div>

                  </section>

                  {/* STATUS */}
                  {type ===
                    'task' && (

                    <section
                      className="
                        rounded-[2rem]

                        border border-border

                        bg-background/40

                        p-5
                      "
                    >

                      <h3
                        className="
                          text-sm
                          font-semibold
                          uppercase
                          tracking-wider

                          text-muted-foreground
                        "
                      >

                        Status

                      </h3>

                      <AndroidAdaptiveSelect
                        label="Status"
                        value={status}
                        onChange={value => setStatus(value as EditableProductivityStatus)}
                        className={`${inputStyle} mt-5`}
                        options={[
                          { value: 'pending', label: 'Pending' },
                          { value: 'in-progress', label: 'In progress' },
                          { value: 'deferred', label: 'Deferred' },
                          { value: 'completed', label: 'Completed' },
                          { value: 'dropped', label: 'Dropped' },
                        ]}
                      />

                    </section>

                  )}

                  {/* DEADLINE */}
                  <section
                    className="
                      rounded-[2rem]

                      border border-border

                      bg-background/40

                      p-5
                    "
                  >

                    <h3
                      className="
                        text-sm
                        font-semibold
                        uppercase
                        tracking-wider

                        text-muted-foreground
                      "
                    >

                      Deadline

                    </h3>

                    <AdaptiveDatePicker
                      label="Deadline"
                      value={deadline}
                      onChange={setDeadline}
                      className={`${inputStyle} mt-5`}
                    />

                  </section>

                </div>

              </div>

            </div>

            {/* FOOTER */}
            <div
              className="
                shrink-0

                border-t border-border/50

                bg-background/80

                px-6
                py-5

                backdrop-blur-2xl
              "
            >

              <div
                className="
                  flex
                  flex-col-reverse
                  gap-3

                  sm:flex-row
                  sm:justify-end
                "
              >

                <Button
                  type="button"
                  variant="outline"
                  onClick={attemptClose}
                  className="
                    h-12
                    rounded-2xl
                    px-6
                  "
                >

                  Cancel

                </Button>

                <Button
                  type="submit"
                  className="
                    h-12
                    rounded-2xl
                    px-6
                    font-semibold
                  "
                >

                  {isEditMode
                    ? 'Save Changes'
                    : 'Add Item'}

                </Button>

              </div>

            </div>

          </form>

          <ConfirmDialog
            isOpen={showUnsavedDialog}
            title={isEditMode
              ? 'Discard Changes?'
              : 'Discard Item?'}
            message="You have unsaved productivity inputs. Are you sure you want to close this modal?"
            confirmText="Discard"
            cancelText="Continue Editing"
            isDangerous
            onConfirm={() => {
              resetForm();
              setShowUnsavedDialog(false);
              onClose();
            }}
            onCancel={() =>
              setShowUnsavedDialog(false)
            }
          />

        </div>

      </div>

    </div>
  );
}
