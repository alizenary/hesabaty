// أيقونات البنود (إيموجي عشان تشتغل أوفلاين ومن غير ملفات)
// البند ممكن يكون له أيقونة محفوظة (icon)، ولو مفيش بنجيبها من الاسم الإنجليزي للبنود الافتراضية.
const BY_NAME = {
  'Cost of sales': '📦', 'Cost of goods sold': '📦', 'Purchase shipping': '🚚', 'Discount allowed': '🏷️', 'Purchases': '🛒',
  'General & admin': '🏢', 'Rent': '🏠', 'Venue rent': '🏬', 'Warehouse rent': '🏭', 'Electricity': '💡',
  'Phone & internet': '📶', 'Maintenance': '🔧', 'Water': '🚰', 'Government fees': '🏛️', 'Professional fees': '💼',
  'Software subscriptions': '💻', 'Depreciation': '📉',
  'Daily revenue': '💵', 'Cafe revenue': '☕', 'From owner': '🤝', 'Other income': '➕', 'Transfer to owner': '📤',
  'Home': '🏠', 'Gas': '🔥', 'Internet': '🌐', 'Household items': '🧺',
  'Food': '🍽️', 'Groceries': '🛒', 'Fruit & veg': '🥦', 'Eating out': '🍔', 'Delivery': '🛵',
  'Transport': '🚗', 'Fuel': '⛽', 'Car maintenance': '🔧', 'Uber/Taxi': '🚕', 'Public transport': '🚌',
  'Telecom': '📱', 'Mobile credit': '📱',
  'Health': '🩺', 'Doctor': '👨‍⚕️', 'Medicine': '💊', 'Lab tests': '🧪',
  'Kids & education': '🎓', 'School': '🏫', 'Tutoring': '📚', 'Supplies': '✏️',
  'Personal': '👤', 'Clothes': '👕', 'Personal care': '🧴', 'Outings': '🎉', 'Travel': '✈️', 'Subscriptions': '🔁',
  'Obligations': '📅', 'Installments': '💳', 'Savings circle': '🤝', 'Card payments': '💳',
  'Occasions': '🎁', 'Gifts': '🎁', 'Charity': '🤲', 'Events': '🎊', 'Other': '📌',
  'Salary': '💰', 'Side work': '🛠️', 'Balance adjustment': '⚖️',
};

export function catIcon(c) {
  if (!c) return '📌';
  return c.icon || BY_NAME[c.nameEn] || (c.kind === 'income' ? '💵' : '📌');
}

// الأيقونات المتاحة للاختيار عند إضافة أو تعديل بند
export const ICON_CHOICES = [
  '🏠', '🏢', '🏬', '🏭', '💡', '🚰', '🔥', '📶', '🌐', '🔧', '🧺', '🧹',
  '🛒', '🍽️', '🍔', '☕', '🥦', '🛵', '🚗', '⛽', '🚕', '🚌', '🚚', '✈️',
  '📱', '💻', '🩺', '💊', '🧪', '🎓', '🏫', '📚', '✏️', '👕', '🧴', '🎉',
  '🎁', '🤲', '🎊', '💳', '📅', '🤝', '💼', '🏛️', '📦', '🏷️', '📉', '🔁',
  '💵', '💰', '🛠️', '📤', '➕', '⚖️', '📌', '⭐',
];
