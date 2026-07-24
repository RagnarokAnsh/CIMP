import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedView } from '../entities';
import { SaveViewDto } from './dto/save-view.dto';

// A real filter set is the dozen short strings the issues list keeps (status,
// priority, q, jql, dates, sort) — a few hundred bytes. Without a cap the only
// ceiling is the global 1mb JSON body limit in main.ts, so any staff member
// could park ~1MB of arbitrary jsonb per view.
const MAX_FILTERS_BYTES = 8 * 1024;

// save() upserts by name, so a caller who keeps inventing names would otherwise
// grow the table without bound. Far above any real workflow.
const MAX_VIEWS_PER_STAFF = 50;

@Injectable()
export class SavedViewsService {
  constructor(
    @InjectRepository(SavedView) private readonly views: Repository<SavedView>,
  ) {}

  async list(staffId: string) {
    const rows = await this.views.find({
      where: { staffUser: { id: staffId } },
      order: { name: 'ASC' },
    });
    return rows.map((v) => this.toDto(v));
  }

  // Upsert by (staffUser, name): saving an existing name overwrites its filters.
  async save(staffId: string, dto: SaveViewDto) {
    // Measured on the serialized form because that is what lands in jsonb; the
    // DTO can't express this (class-validator has no byte-size constraint).
    const bytes = Buffer.byteLength(JSON.stringify(dto.filters), 'utf8');
    if (bytes > MAX_FILTERS_BYTES) {
      throw new BadRequestException(
        `Filter payload is too large (${bytes} bytes, max ${MAX_FILTERS_BYTES}).`,
      );
    }

    let view = await this.views.findOne({
      where: { staffUser: { id: staffId }, name: dto.name },
    });
    if (view) {
      view.filters = dto.filters;
    } else {
      // Only a new name adds a row — overwriting an existing view stores nothing
      // extra, so the cap is checked on the create branch alone.
      const existing = await this.views.count({ where: { staffUser: { id: staffId } } });
      if (existing >= MAX_VIEWS_PER_STAFF) {
        throw new ConflictException(
          `You already have ${MAX_VIEWS_PER_STAFF} saved views. Delete one before saving another.`,
        );
      }
      view = this.views.create({
        staffUser: { id: staffId } as any,
        name: dto.name,
        filters: dto.filters,
      });
    }
    return this.toDto(await this.views.save(view));
  }

  async remove(staffId: string, id: string) {
    const view = await this.views.findOne({
      where: { id, staffUser: { id: staffId } },
    });
    if (!view) throw new NotFoundException('Saved view not found');
    await this.views.remove(view);
    return { ok: true };
  }

  private toDto(v: SavedView) {
    return { id: v.id, name: v.name, filters: v.filters, updatedAt: v.updatedAt };
  }
}
