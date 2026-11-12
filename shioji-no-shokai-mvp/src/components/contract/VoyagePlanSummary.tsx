<既存の VoyagePlanSummary.tsx 全文に、次の1項目を追加した版：

<div className="kv">
  <span>総補油量</span>
  <span>
    {tons(
      plan.sections.reduce(
        (sum, section) => sum + (section.refuelAddedTons ?? 0),
        0,
      ),
    )}
  </span>
</div>

挿入位置は「全行程の計画必要燃料」の直後。「最終計画残燃料」の前。その他の既存コードは変更しない>