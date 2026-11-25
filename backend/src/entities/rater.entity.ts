import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

@Entity('raters')
export class Rater {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ default: '' })
  note: string;

  @CreateDateColumn()
  createdAt: string;

  @Column({ nullable: true })
  lastSeenAt: string;

  /** personal passcode for "accounts" auth mode (admin-managed) */
  @Column({ type: 'text', nullable: true })
  passcode: string | null;
}
