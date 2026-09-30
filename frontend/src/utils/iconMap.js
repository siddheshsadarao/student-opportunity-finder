import {
  Award,
  BookOpen,
  Briefcase,
  Code2,
  Compass,
  Globe,
  GraduationCap,
  Presentation,
  Rocket,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';

export const CATEGORY_ICONS = {
  Award,
  BookOpen,
  Briefcase,
  Code2,
  Compass,
  Globe,
  GraduationCap,
  Presentation,
  Rocket,
  Sparkles,
  Target,
  Trophy,
  Users,
};

export function getCategoryIcon(name) {
  return CATEGORY_ICONS[name] || Compass;
}
