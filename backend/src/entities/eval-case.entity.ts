import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

export interface Turn {
  role: 'patient' | 'assistant';
  content: string;
}

@Entity('cases')
export class EvalCase {
  @PrimaryColumn()
  id: string;

  @Column({ default: 100 })
  order: number;

  @Column()
  title: string;

  @Column({ default: '' })
  titleZh: string;

  @Column({ default: '' })
  scenario: string;

  @Column({ default: '' })
  scenarioZh: string;

  @Column({ type: 'simple-json', nullable: true })
  conversation: Turn[] | null;

  @Column({ type: 'text' })
  patientQuery: string;

  @Column({ type: 'text' })
  responseA: string;

  @Column({ type: 'text', nullable: true })
  responseB: string | null;

  @Column({ default: '' })
  sourceTitle: string;

  @Column({ type: 'text', nullable: true })
  sourceText: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: string;
}
