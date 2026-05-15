import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Box,
  Check,
  CheckCircle,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Clock,
  Copy,
  Cpu,
  Download,
  Edit2,
  Eye,
  EyeOff,
  Home,
  Lock,
  Menu,
  PauseCircle,
  Pencil,
  PlusCircle,
  RefreshCw,
  Search,
  Repeat,
  ScanLine,
  Send,
  Settings,
  Share2,
  Shield,
  ShieldOff,
  Trash2,
  Trophy,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";
import React from "react";
import { type LucideProps } from "lucide-react-native";

type LucideIcon = React.ComponentType<LucideProps>;

const MAP: Record<string, LucideIcon> = {
  "activity": Activity,
  "alert-circle": AlertCircle,
  "alert-circle-outline": AlertCircle,
  "alert-triangle": AlertTriangle,
  "arrow-back": ArrowLeft,
  "arrow-forward": ArrowRight,
  "bar-chart": BarChart2,
  "bar-chart-outline": BarChart2,
  "box": Box,
  "checkmark": Check,
  "checkmark-circle-outline": CheckCircle,
  "chevron-forward": ChevronRight,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "clipboard": Clipboard,
  "clipboard-outline": Clipboard,
  "clock": Clock,
  "close": X,
  "copy": Copy,
  "copy-outline": Copy,
  "cpu": Cpu,
  "cube-outline": Box,
  "download": Download,
  "download-outline": Download,
  "edit-2": Edit2,
  "eye": Eye,
  "eye-off": EyeOff,
  "eye-off-outline": EyeOff,
  "eye-outline": Eye,
  "flash-outline": Zap,
  "hardware-chip-outline": Cpu,
  "home": Home,
  "home-outline": Home,
  "lock": Lock,
  "lock-closed-outline": Lock,
  "menu": Menu,
  "paper-plane-outline": Send,
  "pause-circle-outline": PauseCircle,
  "pencil-outline": Pencil,
  "plus-circle": PlusCircle,
  "pulse-outline": Activity,
  "refresh-outline": RefreshCw,
  "refresh-cw": RefreshCw,
  "repeat": Repeat,
  "repeat-outline": Repeat,
  "send": Send,
  "settings": Settings,
  "settings-outline": Settings,
  "share-social-outline": Share2,
  "shield": Shield,
  "shield-half-outline": ShieldOff,
  "shield-outline": Shield,
  "time-outline": Clock,
  "trash-outline": Trash2,
  "trophy-outline": Trophy,
  "scan": ScanLine,
  "search": Search,
  "wallet": Wallet,
  "warning-outline": AlertTriangle,
  "x": X,
  "zap": Zap,
};

type Props = {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: LucideProps["style"];
};

export function Icon({ name, size = 20, color = "#FFFFFF", strokeWidth = 1.75, style }: Props) {
  const Component = MAP[name];
  if (!Component) {
    if (__DEV__) console.warn(`Icon: unknown name "${name}"`);
    return null;
  }
  return <Component size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
