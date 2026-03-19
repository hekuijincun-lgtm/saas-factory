'use client';

interface PetInfoBannerProps {
  surveyAnswers?: Record<string, string | boolean>;
}

export function PetInfoBanner({ surveyAnswers }: PetInfoBannerProps) {
  if (!surveyAnswers) return null;

  const petName = surveyAnswers.pet_name;
  const petBreed = surveyAnswers.pet_breed;
  const petAge = surveyAnswers.pet_age;
  const petAllergy = surveyAnswers.pet_allergy;

  if (!petName && !petBreed) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">&#x1f43e;</span>
        <h3 className="text-sm font-bold text-orange-900">ペット情報</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {petName && (
          <div>
            <span className="text-orange-600">お名前:</span>
            <span className="ml-1 text-orange-900 font-medium">{String(petName)}</span>
          </div>
        )}
        {petBreed && (
          <div>
            <span className="text-orange-600">犬種:</span>
            <span className="ml-1 text-orange-900 font-medium">{String(petBreed)}</span>
          </div>
        )}
        {petAge && (
          <div>
            <span className="text-orange-600">年齢:</span>
            <span className="ml-1 text-orange-900 font-medium">{String(petAge)}</span>
          </div>
        )}
        {petAllergy && String(petAllergy).trim() && (
          <div className="col-span-2">
            <span className="text-orange-600">アレルギー・注意事項:</span>
            <span className="ml-1 text-orange-900 font-medium">{String(petAllergy)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
