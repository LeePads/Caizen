'use client';

import { memo } from 'react';
import {
  Accessibility,
  Activity,
  Anchor,
  Apple,
  BadgeDollarSign,
  Baby,
  Banknote,
  Bath,
  BedDouble,
  Bike,
  Bone,
  Brain,
  BookOpen,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  BusFront,
  CakeSlice,
  Calculator,
  CalendarClock,
  CalendarDays,
  Camera,
  CarFront,
  CarTaxiFront,
  Cat,
  CircleDollarSign,
  CircleDot,
  CircleHelp,
  CircleUserRound,
  Coins,
  Cloud,
  Coffee,
  CookingPot,
  CreditCard,
  CupSoda,
  Dog,
  Dumbbell,
  Factory,
  FileKey,
  Film,
  Flower2,
  Folder,
  Fuel,
  Gamepad2,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  HandCoins,
  Heart,
  HeartPulse,
  Home,
  Hospital,
  IceCreamBowl,
  KeyRound,
  Keyboard,
  Laptop,
  Landmark,
  Leaf,
  Library,
  Lightbulb,
  Luggage,
  MapPinned,
  Medal,
  Monitor,
  MoreHorizontal,
  Mountain,
  Music2,
  NotebookPen,
  Package,
  PawPrint,
  Pencil,
  PiggyBank,
  Pill,
  Pizza,
  PartyPopper,
  Plane,
  Presentation,
  Receipt,
  ReceiptText,
  Refrigerator,
  Router,
  Salad,
  School,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  ShieldCheck,
  Sofa,
  Sparkles,
  Smartphone,
  Star,
  Sun,
  Stethoscope,
  Store,
  Tags,
  Target,
  Theater,
  Ticket,
  TrainFront,
  TreePine,
  Trophy,
  Tv,
  Utensils,
  Users,
  UserRoundPlus,
  Wallet,
  WalletCards,
  Wifi,
  Wine,
  Volleyball,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import {
  resolveFinancialClassificationIconId,
  resolveFinancialIconId,
  type FinancialIconDefinition,
} from '@/lib/finance/category-icons';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  accessibility: Accessibility,
  activity: Activity,
  anchor: Anchor,
  apple: Apple,
  'badge-dollar-sign': BadgeDollarSign,
  baby: Baby,
  banknote: Banknote,
  bath: Bath,
  'bed-double': BedDouble,
  bike: Bike,
  bone: Bone,
  brain: Brain,
  'book-open': BookOpen,
  briefcase: Briefcase,
  'briefcase-business': BriefcaseBusiness,
  'building-2': Building2,
  'bus-front': BusFront,
  'cake-slice': CakeSlice,
  calculator: Calculator,
  'calendar-clock': CalendarClock,
  'calendar-days': CalendarDays,
  camera: Camera,
  'car-front': CarFront,
  'car-taxi-front': CarTaxiFront,
  cat: Cat,
  'circle-dollar-sign': CircleDollarSign,
  'circle-dot': CircleDot,
  'circle-help': CircleHelp,
  'circle-user-round': CircleUserRound,
  coins: Coins,
  cloud: Cloud,
  coffee: Coffee,
  'cooking-pot': CookingPot,
  'credit-card': CreditCard,
  'cup-soda': CupSoda,
  dog: Dog,
  dumbbell: Dumbbell,
  factory: Factory,
  'file-key': FileKey,
  film: Film,
  'flower-2': Flower2,
  folder: Folder,
  fuel: Fuel,
  'gamepad-2': Gamepad2,
  gift: Gift,
  globe: Globe,
  'graduation-cap': GraduationCap,
  hammer: Hammer,
  'hand-coins': HandCoins,
  heart: Heart,
  'heart-pulse': HeartPulse,
  home: Home,
  hospital: Hospital,
  'ice-cream-bowl': IceCreamBowl,
  'key-round': KeyRound,
  keyboard: Keyboard,
  laptop: Laptop,
  landmark: Landmark,
  leaf: Leaf,
  library: Library,
  lightbulb: Lightbulb,
  luggage: Luggage,
  'map-pinned': MapPinned,
  medal: Medal,
  monitor: Monitor,
  'more-horizontal': MoreHorizontal,
  mountain: Mountain,
  'music-2': Music2,
  'notebook-pen': NotebookPen,
  package: Package,
  'party-popper': PartyPopper,
  'paw-print': PawPrint,
  pencil: Pencil,
  'piggy-bank': PiggyBank,
  pill: Pill,
  pizza: Pizza,
  plane: Plane,
  presentation: Presentation,
  receipt: Receipt,
  'receipt-text': ReceiptText,
  refrigerator: Refrigerator,
  router: Router,
  salad: Salad,
  school: School,
  scissors: Scissors,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  'shopping-basket': ShoppingBasket,
  'shopping-cart': ShoppingCart,
  'shield-check': ShieldCheck,
  sofa: Sofa,
  sparkles: Sparkles,
  smartphone: Smartphone,
  star: Star,
  sun: Sun,
  stethoscope: Stethoscope,
  store: Store,
  tags: Tags,
  target: Target,
  theater: Theater,
  ticket: Ticket,
  'train-front': TrainFront,
  'tree-pine': TreePine,
  trophy: Trophy,
  tv: Tv,
  utensils: Utensils,
  users: Users,
  'user-round-plus': UserRoundPlus,
  wallet: Wallet,
  'wallet-cards': WalletCards,
  wifi: Wifi,
  wine: Wine,
  volleyball: Volleyball,
  wrench: Wrench,
  zap: Zap,
};

const SIZE_CLASSES = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
} as const;

export type CategoryIconSize = keyof typeof SIZE_CLASSES;

export type CategoryIconProps = {
  iconId?: string;
  categoryIconId?: string;
  subcategoryIconId?: string;
  size?: CategoryIconSize;
  className?: string;
  containerClassName?: string;
  decorative?: boolean;
  title?: string;
};

export const CategoryIcon = memo(function CategoryIcon({
  iconId,
  categoryIconId,
  subcategoryIconId,
  size = 'md',
  className,
  containerClassName,
  decorative = true,
  title,
}: CategoryIconProps) {
  const resolvedId = categoryIconId !== undefined || subcategoryIconId !== undefined
    ? resolveFinancialClassificationIconId(categoryIconId, subcategoryIconId)
    : resolveFinancialIconId(iconId);
  const Icon = ICON_COMPONENTS[resolvedId] || ICON_COMPONENTS.folder;
  const icon = <Icon className={cn(SIZE_CLASSES[size], className)} aria-hidden="true" />;

  const trigger = (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-xl bg-primary/10 text-primary', containerClassName)}
      role={!decorative && title ? 'img' : undefined}
      aria-label={!decorative ? title : undefined}
      aria-hidden={decorative ? true : undefined}
    >
      {icon}
    </span>
  );
  return title ? <Tooltip><TooltipTrigger asChild>{trigger}</TooltipTrigger><TooltipContent>{title}</TooltipContent></Tooltip> : trigger;
});

export function categoryIconOption(
  definition: FinancialIconDefinition,
  className = 'h-4 w-4',
) {
  return (
    <CategoryIcon
      iconId={definition.id}
      size="sm"
      className={className}
      containerClassName="h-7 w-7 rounded-lg"
      title={definition.label}
    />
  );
}

export const CategoryIconRegistry = ICON_COMPONENTS;
