import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedView } from '../entities';
import { SaveViewDto } from './dto/save-view.dto';

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
    let view = await this.views.findOne({
      where: { staffUser: { id: staffId }, name: dto.name },
    });
    if (view) {
      view.filters = dto.filters;
    } else {
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
