import { PatientAgeCategory } from '@/types/arrest';

export const PatientAgeCategoryList = Object.values(PatientAgeCategory);

export const DosageCalculator = {
  calculateAdrenalineDose: (age: PatientAgeCategory): string => {
    switch (age) {
      case PatientAgeCategory.Adult: return "1mg";
      case PatientAgeCategory.Paediatric: return "10mcg/kg";
      case PatientAgeCategory.Neonate: return "10-30mcg/kg";
      default: return "N/A";
    }
  },
  
  calculateAmiodaroneDose: (age: PatientAgeCategory, doseNumber: number): string | null => {
    switch (age) {
      case PatientAgeCategory.Adult:
        return doseNumber === 1 ? "300mg" : "150mg";
      case PatientAgeCategory.Paediatric:
        return "5mg/kg";
      case PatientAgeCategory.Neonate:
        return null; // Not indicated for neonates
      default:
        return null;
    }
  }
};
