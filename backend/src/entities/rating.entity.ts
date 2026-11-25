import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type RatingStatus = 'draft' | 'submitted';

@Entity('ratings')
@Index(['raterId', 'caseId'], { unique: true })
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  raterId: string;

  @Column()
  caseId: string;

  @Column({ type: 'simple-json' })
  scores: Record<string, any>;

  @Column({ default: '' })
  notes: string;

  @Column({ default: 'draft' })
  status: RatingStatus;

  @Column({ type: 'text', nullable: true })
  submittedAt: string | null;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
