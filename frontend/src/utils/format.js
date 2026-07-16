export const formatAccounting = (value) => {
  if (value === null || value === undefined || value === '') return '';
  
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.abs(num));
  
  return num < 0 ? `(${formatted})` : formatted;
};

// Formatter with compact suffixes (K, M, B) for Dashboard KPIs
export const formatAccountingCompact = (value) => {
  if (value === null || value === undefined || value === '') return '';
  
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  const absNum = Math.abs(num);
  let formatted = '';
  
  if (absNum >= 1.0e9) {
    // Billions
    formatted = (absNum / 1.0e9).toFixed(1).replace(/\.0$/, '') + 'B';
  } else if (absNum >= 1.0e6) {
    // Millions
    formatted = (absNum / 1.0e6).toFixed(1).replace(/\.0$/, '') + 'M';
  } else if (absNum >= 1.0e3) {
    // Thousands
    formatted = (absNum / 1.0e3).toFixed(1).replace(/\.0$/, '') + 'K';
  } else {
    // Under 1000
    formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(absNum);
  }
  
  return num < 0 ? `(${formatted})` : formatted;
};