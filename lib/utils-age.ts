export function formatItemAge(purchaseDate: Date): string {
  const now = new Date();
  const purchase = new Date(purchaseDate);
  
  let years = now.getFullYear() - purchase.getFullYear();
  let months = now.getMonth() - purchase.getMonth();
  let days = now.getDate() - purchase.getDate();

  // Adjust for negative days
  if (days < 0) {
    months--;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }

  // Adjust for negative months
  if (months < 0) {
    years--;
    months += 12;
  }

  // Build the string
  const parts: string[] = [];
  
  if (years > 0) {
    parts.push(`${years} year${years > 1 ? 's' : ''}`);
  }
  if (months > 0) {
    parts.push(`${months} month${months > 1 ? 's' : ''}`);
  }
  if (days > 0 && years === 0) {
    parts.push(`${days} day${days > 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return 'Today';
  }

  return parts.join(' ');
}
