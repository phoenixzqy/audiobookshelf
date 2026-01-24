import { useTranslation } from 'react-i18next';

export type BookCategory = 'adult' | 'kids';

interface CategoryTabsProps {
  activeCategory: BookCategory;
  onCategoryChange: (category: BookCategory) => void;
}

export default function CategoryTabs({ activeCategory, onCategoryChange }: CategoryTabsProps) {
  const { t } = useTranslation();

  const categories: { value: BookCategory; labelKey: string }[] = [
    { value: 'adult', labelKey: 'categories.adult' },
    { value: 'kids', labelKey: 'categories.kids' },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {categories.map((category) => {
        const isActive = activeCategory === category.value;

        return (
          <button
            key={category.value}
            onClick={() => onCategoryChange(category.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-150
              ${isActive
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
          >
            {t(category.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
