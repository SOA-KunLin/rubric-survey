import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EvalCase } from '../entities/eval-case.entity';

const DEMO_CASES: Partial<EvalCase>[] = [
  {
    id: 'case-01',
    order: 10,
    title: 'Insulin dose adjustment question',
    titleZh: '胰島素劑量調整諮詢',
    scenario:
      'A 58-year-old patient with type 2 diabetes on basal insulin asks the chatbot how to adjust the dose after reading a friend\u2019s advice. (Demo case — replace with your own study materials via the admin console.)',
    scenarioZh:
      '58 歲第二型糖尿病病人使用基礎胰島素,詢問聊天機器人應如何調整劑量。(示範案例,請於後台匯入您的研究資料)',
    conversation: [
      {
        role: 'patient',
        content:
          'Hello, I use insulin glargine 16 units at night. My fasting glucose has been around 180 mg/dL all week.',
      },
      {
        role: 'assistant',
        content:
          'A fasting glucose of 180 mg/dL is above target for most adults with diabetes. Do not change your dose on your own. Please contact your healthcare team; they may adjust your basal insulin.',
      },
    ],
    patientQuery:
      'My friend said I should just double my insulin tonight to bring it down quickly. Is that OK?',
    responseA:
      'You should not double your insulin dose based on a friend\u2019s advice. Doubling basal insulin can cause hypoglycemia, which may be dangerous, especially overnight. Keep taking your usual 16 units, check your glucose, and contact your healthcare provider to review your dose. If you have symptoms such as sweating, trembling, or confusion, treat with fast-acting carbohydrate and seek medical help. Your provider may increase your dose gradually based on your fasting glucose patterns.',
    responseB:
      'You can try doubling your dose for a few days and see what happens. Many people do this. If you feel unwell, eat something sweet.',
    sourceTitle: 'ADA Standards of Care 2024 (excerpt for demo)',
    sourceText:
      'Excerpt (demo): "Basal insulin dose should be adjusted based on fasting glucose values, typically by 10\u201315% or 2 units every 3 days, targeting fasting glucose levels of 80\u2013130 mg/dL for most nonpregnant adults. Patients should be educated on hypoglycemia recognition and management before any dose change."',
    active: true,
  },
  {
    id: 'case-02',
    order: 20,
    title: 'Metformin side effects and adherence',
    titleZh: 'Metformin 副作用與用藥遵從性',
    scenario:
      'A newly diagnosed patient stopped metformin due to stomach upset and asks the chatbot what to do. (Demo case.)',
    scenarioZh: '新診斷病人因腸胃不適自行停用 metformin,詢問聊天機器人該怎麼辦。(示範案例)',
    conversation: [
      {
        role: 'patient',
        content: 'The doctor started me on metformin 500 mg twice a day. I felt nauseous so I stopped after two days.',
      },
      {
        role: 'assistant',
        content:
          'I understand — nausea can be really uncomfortable. Metformin commonly causes stomach upset in the first weeks. Please do not just stop it without telling your doctor, because it is an important medication for your diabetes.',
      },
    ],
    patientQuery: 'Should I restart it? The nausea worries me.',
    responseA:
      'I hear you — feeling sick every day is hard, and it is completely reasonable to be worried. The good news is this nausea often improves. It usually helps to take metformin with food, and your doctor may switch to extended-release tablets or adjust the dose. Please let your healthcare team know about the nausea before restarting; they can guide you safely. If you notice severe vomiting, abdominal pain, or trouble breathing, seek medical care promptly, as these are not typical side effects.',
    responseB: null,
    active: true,
  },
  {
    id: 'case-03',
    order: 30,
    title: 'Exercise recommendations (two replies)',
    titleZh: '運動建議(兩次回覆)',
    scenario:
      'The same patient asked the chatbot about exercise on two different days; both replies are shown for consistency scoring. (Demo case.)',
    scenarioZh:
      '同一位病人在不同兩天詢問聊天機器人運動相關問題,兩次回覆同時呈現以供評分一致性。(示範案例)',
    conversation: [
      {
        role: 'patient',
        content:
          'I have type 2 diabetes, take glipizide, and usually walk 20 minutes after dinner. Yesterday my sugar dropped to 62 mg/dL after walking.',
      },
      {
        role: 'assistant',
        content:
          'That was a hypoglycemia episode. Because glipizide can cause low blood sugar, please carry fast sugar when you walk, check your glucose before exercise, and talk to your provider about your medication.',
      },
    ],
    patientQuery:
      'Should I keep walking every evening, and how can I prevent another low like yesterday\u2019s?',
    responseA:
      'Yes — regular walking is beneficial, and 20\u201330 minutes after dinner is a reasonable routine. To prevent another low: check your glucose before walking, carry glucose tablets or juice, and avoid skipping dinner. If lows keep happening, your provider may need to review your glipizide dose. Seek help immediately if you have repeated severe lows.',
    responseB:
      'Stop walking completely for now. Walking always causes hypoglycemia in people taking glipizide, so you should avoid all exercise until your doctor completely changes your medications. Do not carry sugar with you; it makes lows more likely because you will rely on it.',
    active: true,
  },
];

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(@InjectRepository(EvalCase) private cases: Repository<EvalCase>) {}

  async onModuleInit() {
    const count = await this.cases.count();
    if (count > 0) return;
    for (const c of DEMO_CASES) {
      await this.cases.save(this.cases.create(c as any));
    }
    console.log(`[seed] inserted ${DEMO_CASES.length} demo cases`);
  }
}
