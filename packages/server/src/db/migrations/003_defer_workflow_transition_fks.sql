-- 流程轉換規則整包替換時，同交易內先清空 workflow_states 再清空
-- workflow_transitions（見 issueTypes.ts PUT /:id/workflow 與
-- issueRepo.initializeTypeWorkflow），若外鍵即時檢查，刪 states 當下
-- 舊 transitions 仍引用它會直接撞外鍵。
-- 改延遲檢查：同交易內任意順序刪除／插入皆可，commit 前只要三張表
-- 最終一致即通過，不需重排呼叫順序或拆函式。
ALTER TABLE workflow_transitions
  ALTER CONSTRAINT fk_workflow_transitions_from DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE workflow_transitions
  ALTER CONSTRAINT fk_workflow_transitions_to DEFERRABLE INITIALLY DEFERRED;
