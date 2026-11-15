import { useEffect, useRef, useState } from 'react';
import { useReviewStore } from '../../../store/reviewStore';
import { useAuthStore } from '../../../store/authStore';
import { platformService } from '../../../shared/services/platformService';
import type { CriterionStatus } from '../../../features/evaluation/types/evaluation.types';
import type { EvaluationStats } from '../../../features/evaluation/types/evaluation.types';

export function useReview(submissionId: string) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const currentUser = useAuthStore((s) => s.currentUser);
  const {
    review,
    setReview,
    advanceStage,
    completeReview,
    updateStageCriterionStatus,
    updateStageCriterionObservation,
    updateStageCriterionPageRef,
  } = useReviewStore();

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    platformService.getOrCreateReview(submissionId, currentUser.id).then(value => { if(active) setReview(value); }).catch(e => { if(active) setError((e as Error).message); });
    return () => { active = false; };
  }, [submissionId, currentUser, setReview]);

  const currentStage = review ? review.stages[review.currentStageIndex] : null;
  const isLastStage = review ? review.currentStageIndex === review.stages.length - 1 : false;
  const isComplete = Boolean(review?.completedAt);

  const stageStats: EvaluationStats | null = currentStage
    ? (() => {
        const approved = currentStage.criteria.filter((c) => c.status === 'approved').length;
        const rejected = currentStage.criteria.filter((c) => c.status === 'rejected').length;
        const pending = currentStage.criteria.filter((c) => c.status === 'pending').length;
        const total = currentStage.criteria.length;
        return {
          total,
          approved,
          rejected,
          pending,
          completionRate: total > 0 ? Math.round(((approved + rejected) / total) * 100) : 0,
        };
      })()
    : null;

  const persist = async (mutate?: () => void) => {
    if(operation.current) return false;
    operation.current=true;setBusy(true);setError('');
    const previous=useReviewStore.getState().review;
    try {
      mutate?.();
      const updated=useReviewStore.getState().review;
      setReview(previous);
      if(updated && previous) await platformService.saveReview(updated,previous.stages[previous.currentStageIndex].id);
      setReview(await platformService.getReview(submissionId));
      return true;
    } catch(e) {
      setReview(previous);setError((e as Error).message);
      return false;
    } finally {operation.current=false;setBusy(false);}
  };
  const handleAdvance = () => persist(advanceStage);
  const handleComplete = (comment:string,grade:number) => persist(() => completeReview(comment,grade));
  const handleSave = () => persist();

  const updateStatus = (criterionId: string, status: CriterionStatus) => {
    if (!review) return;
    updateStageCriterionStatus(review.currentStageIndex, criterionId, status);
  };

  const updateObservation = (criterionId: string, observation: string) => {
    if (!review) return;
    updateStageCriterionObservation(review.currentStageIndex, criterionId, observation);
  };

  const updatePageRef = (criterionId: string, page: number | undefined) => {
    if (!review) return;
    updateStageCriterionPageRef(review.currentStageIndex, criterionId, page);
  };

  return {
    error, busy,
    review,
    currentStage,
    stageStats,
    isLastStage,
    isComplete,
    handleAdvance,
    handleComplete,
    handleSave,
    updateStatus,
    updateObservation,
    updatePageRef,
  };
}
