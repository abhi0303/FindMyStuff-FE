import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  Archive, ArrowLeft as LucideArrowLeft, ArrowRight as LucideArrowRight, ArrowRightLeft, Backpack, Bed, Bell, Box,
  Building2, Camera, Car, Check, ChevronDown as LucideChevronDown, ChevronLeft as LucideChevronLeft,
  ChevronRight as LucideChevronRight, ChevronsUp,
  CloudOff, CloudUpload,
  Clock, DoorOpen, Handshake, History, House, ImageOff, Inbox, KeyRound, LampDesk, Library, Link, ListFilter, Lock,
  LockKeyhole, LogOut, Luggage, MapPin, Moon, Package, Pencil, Plus, Printer, QrCode, RefreshCw, Refrigerator,
  Rows3, ScanLine, Search, Server, ShieldCheck, Shirt, Sun, Tag, Trash2, TriangleAlert, User, Users, Vault,
  Warehouse, X,
} from 'lucide-react';
import type { PlaceType, StorageType } from '@/api/types';

type IconProps = LucideProps;

/* Every icon comes from Lucide at one size and stroke weight, so the set reads as a family.
   Callers can still override size, strokeWidth, className, style or aria-label. */
const base = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const;

export const SearchIcon = (p: IconProps) => <Search {...base} {...p} />;
export const HomeIcon = (p: IconProps) => <House {...base} {...p} />;
export const BoxIcon = (p: IconProps) => <Package {...base} {...p} />;
export const PlusIcon = (p: IconProps) => <Plus {...base} {...p} />;
export const ScanIcon = (p: IconProps) => <ScanLine {...base} {...p} />;
export const UserIcon = (p: IconProps) => <User {...base} {...p} />;
export const UsersIcon = (p: IconProps) => <Users {...base} {...p} />;
export const ChevronRight = (p: IconProps) => <LucideChevronRight {...base} {...p} />;
export const ChevronLeft = (p: IconProps) => <LucideChevronLeft {...base} {...p} />;
export const ChevronDown = (p: IconProps) => <LucideChevronDown {...base} {...p} />;
export const ArrowLeft = (p: IconProps) => <LucideArrowLeft {...base} {...p} />;
export const ArrowRight = (p: IconProps) => <LucideArrowRight {...base} {...p} />;
export const LockIcon = (p: IconProps) => <Lock {...base} {...p} />;
export const ClockIcon = (p: IconProps) => <Clock {...base} {...p} />;
export const AlertIcon = (p: IconProps) => <TriangleAlert {...base} {...p} />;
export const BellIcon = (p: IconProps) => <Bell {...base} {...p} />;
export const CheckIcon = (p: IconProps) => <Check {...base} {...p} />;
export const TrashIcon = (p: IconProps) => <Trash2 {...base} {...p} />;
export const EditIcon = (p: IconProps) => <Pencil {...base} {...p} />;
export const MoveIcon = (p: IconProps) => <ArrowRightLeft {...base} {...p} />;
export const QrIcon = (p: IconProps) => <QrCode {...base} {...p} />;
export const LogoutIcon = (p: IconProps) => <LogOut {...base} {...p} />;
export const SunIcon = (p: IconProps) => <Sun {...base} {...p} />;
export const MoonIcon = (p: IconProps) => <Moon {...base} {...p} />;
export const MapPinIcon = (p: IconProps) => <MapPin {...base} {...p} />;
export const TagIcon = (p: IconProps) => <Tag {...base} {...p} />;
export const HandIcon = (p: IconProps) => <Handshake {...base} {...p} />;
export const HistoryIcon = (p: IconProps) => <History {...base} {...p} />;
export const CameraIcon = (p: IconProps) => <Camera {...base} {...p} />;
export const ImageOffIcon = (p: IconProps) => <ImageOff {...base} {...p} />;
export const XIcon = (p: IconProps) => <X {...base} {...p} />;
export const FilterIcon = (p: IconProps) => <ListFilter {...base} {...p} />;
export const PrinterIcon = (p: IconProps) => <Printer {...base} {...p} />;
export const RefreshIcon = (p: IconProps) => <RefreshCw {...base} {...p} />;
export const InboxIcon = (p: IconProps) => <Inbox {...base} {...p} />;
export const LinkIcon = (p: IconProps) => <Link {...base} {...p} />;
export const KeyIcon = (p: IconProps) => <KeyRound {...base} {...p} />;
export const ShieldIcon = (p: IconProps) => <ShieldCheck {...base} {...p} />;
export const OfflineIcon = (p: IconProps) => <CloudOff {...base} {...p} />;
export const CloudUploadIcon = (p: IconProps) => <CloudUpload {...base} {...p} />;

/** Storage type → icon. Purely decorative; the label always carries the meaning. */
const STORAGE_ICON: Record<StorageType, LucideIcon> = {
  ROOM: DoorOpen, ALMIRAH: Archive, WARDROBE: Shirt, CABINET: Server, SHELF: Library, DRAWER: Inbox,
  BED: Bed, BOX: Package, SUITCASE: Luggage, BAG: Backpack, FRIDGE: Refrigerator, LOFT: ChevronsUp,
  RACK: Rows3, DESK: LampDesk, SAFE: Vault, OTHER: Box,
};

const PLACE_ICON: Record<PlaceType, LucideIcon> = {
  HOME: House, OFFICE: Building2, LOCKER: LockKeyhole, VEHICLE: Car, STORAGE_UNIT: Warehouse, OTHER: MapPin,
};

export function StorageIcon({ type, ...props }: IconProps & { type: StorageType | undefined }) {
  const Icon = STORAGE_ICON[type ?? 'OTHER'] ?? Box;
  return <Icon {...base} {...props} />;
}

export function PlaceIcon({ type, ...props }: IconProps & { type: PlaceType | undefined }) {
  const Icon = PLACE_ICON[type ?? 'OTHER'] ?? MapPin;
  return <Icon {...base} {...props} />;
}
